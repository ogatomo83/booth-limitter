// 拡張を入れた Chrome (headless) で、公開されている BOOTH の商品ページを開いて確かめる。
//   node test/e2e.mjs [商品の URL]   スクリーンショットは test/out/
// カートには実際には入れない (囁きが出たところで止める)。
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const URL = process.argv[2] || "https://booth.pm/ja/items/4493526";
const OUT = "test/out"; mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${mkdtempSync(join(tmpdir(), "suki-"))}`,
  "--no-first-run", "--window-size=1280,900",
  // Chrome 137 以降は --load-extension が効かないので、DevTools の Extensions.loadUnpacked で入れる
  "--enable-unsafe-extension-debugging", "about:blank"], { stdio: "ignore" });
let t; for (let i = 0; i < 50; i++) { try { t = await (await fetch("http://127.0.0.1:9335/json")).json(); break; } catch { await sleep(200); } }
const browserWs = new WebSocket((await (await fetch("http://127.0.0.1:9335/json/version")).json()).webSocketDebuggerUrl);
await new Promise(r => browserWs.onopen = r);
const loaded = await new Promise(r => { browserWs.onmessage = e => r(JSON.parse(e.data)); browserWs.send(JSON.stringify({ id: 1, method: "Extensions.loadUnpacked", params: { path: resolve("src") } })); });
if (loaded.error) { console.log("拡張を入れられません:", loaded.error.message); chrome.kill(); process.exit(2); }
const ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { pend.get(m.id)?.(m); return; } if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; };
const shot = async n => writeFileSync(join(OUT, n), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
let fails = 0; const check = (n, ok, x = "") => { if (!ok) fails++; console.log(`${ok ? "ok" : "NG"}  ${n}${x ? "  " + x : ""}`); };
const sr = `document.getElementById("suki-nefuda-root")?.shadowRoot`;

await send("Runtime.enable"); await send("Page.enable");
await send("Page.navigate", { url: URL }); await sleep(4000);
check("右下に残りが出る", (await ev(`${sr}?.querySelector(".pill")?.innerText`))?.includes("¥10,000"), await ev(`${sr}?.querySelector(".pill")?.innerText`));
await ev(`${sr}.querySelector(".pill").click()`); await sleep(300);
const panel = await ev(`${sr}.querySelector(".panel").innerText`);
check("種類ごとに買うと残り", /この商品を買うと/.test(panel) && /残り ¥8,500/.test(panel), panel.split("\n").slice(0, 14).join(" / "));
await shot("1-panel.png");
await ev(`${sr}.querySelector("[data-buy='0']").click()`); await sleep(500);
check("買ったで減る", (await ev(`${sr}.querySelector(".pill").innerText`)).includes("¥8,500"), await ev(`${sr}.querySelector(".pill").innerText`));
// カートに入れるボタン → 囁き (実際には入れない)
const before = await ev("location.href");
await ev(`document.querySelector(".variation-cart button, .variation-cart input[type=submit]").click()`); await sleep(500);
const w = await ev(`${sr}.querySelector(".whisper").hidden ? "" : ${sr}.querySelector(".whisper").innerText`);
check("カートの前で囁く (ページは移らない)", /今月の予算はあと ¥8,500。これを買うと残り ¥7,000/.test(w) && (await ev("location.href")) === before, w.replace(/\n/g, " / "));
await shot("2-whisper.png");
await ev(`[...${sr}.querySelectorAll(".whisper button")].find(b => b.dataset.act === "stop").click()`); await sleep(200);
check("やめておくで閉じる", await ev(`${sr}.querySelector(".whisper").hidden`));
check("ページのエラーなし", errs.length === 0, errs.slice(0, 3).join(" | "));
// ---- カートとご注文内容確認 (本物の BOOTH には送らない: 下の URL は Chrome の中で写しに差し替える)
const FIX = {
  "https://sekivrc.booth.pm/cart": "test/fixtures/cart.html",
  "https://checkout.booth.pm/checkout/step3": "test/fixtures/step3.html",
  "https://checkout.booth.pm/checkout/create": null, // 注文の確定: 何も送らず、空のページを返す
};
const { readFileSync } = await import("node:fs");
let created = 0;
ws.addEventListener("message", async e => {
  const m = JSON.parse(e.data);
  if (m.method !== "Fetch.requestPaused") return;
  const url = m.params.request.url.split("?")[0];
  if (url.endsWith("/checkout/create")) created++;
  const f = FIX[url];
  const body = f ? readFileSync(f) : Buffer.from("<!doctype html><title>done</title>ok");
  send("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "text/html; charset=utf-8" }], body: body.toString("base64") });
});
await send("Fetch.enable", { patterns: [{ urlPattern: "https://sekivrc.booth.pm/*" }, { urlPattern: "https://checkout.booth.pm/*" }] });

await send("Page.navigate", { url: "https://sekivrc.booth.pm/cart" }); await sleep(2500);
const wc = await ev(`${sr}.querySelector(".whisper").hidden ? "" : ${sr}.querySelector(".whisper").innerText`);
check("カートで合計を囁く", /カートは全部で ¥4,800（SEKIVRC ¥300、テストショップ ¥4,500）。今月の予算はあと ¥8,500。これを買うと残り ¥3,700/.test(wc), wc.replace(/\n/g, " / "));
await shot("3-cart.png");

await send("Page.navigate", { url: "https://checkout.booth.pm/checkout/step3" }); await sleep(2500);
const w3 = await ev(`${sr}.querySelector(".whisper").hidden ? "" : ${sr}.querySelector(".whisper").innerText`);
check("確認画面で囁く", /あと ¥8,500。これを買うと残り ¥8,070.*自動で記録/.test(w3.replace(/\n/g, "")), w3.replace(/\n/g, " / "));
await shot("4-confirm.png");
await ev(`document.querySelector('input[name="commit"]').click()`); await sleep(2000);
check("確定ボタンは止めない (送信された)", created === 1, `create ${created} 回`);
await send("Page.navigate", { url: "https://sekivrc.booth.pm/cart" }); await sleep(2500);
await ev(`${sr}.querySelector(".whisper [data-act=close]")?.click()`);
await ev(`${sr}.querySelector(".pill").click()`); await sleep(300);
const p2 = await ev(`${sr}.querySelector(".panel").innerText`);
check("注文が自動で記録される (商品 ¥300 + 手数料 ¥130)", /¥8,070/.test(await ev(`${sr}.querySelector(".pill").innerText`)) && /2点セット/.test(p2) && /手数料など/.test(p2), p2.split("\n").slice(0, 12).join(" / "));
// 同じ注文をもう一度確定しても二重に数えない
await send("Page.navigate", { url: "https://checkout.booth.pm/checkout/step3" }); await sleep(2000);
await ev(`document.querySelector('input[name="commit"]').click()`); await sleep(2000);
await send("Page.navigate", { url: "https://sekivrc.booth.pm/cart" }); await sleep(2000);
check("同じ注文は二重に記録しない", /¥8,070/.test(await ev(`${sr}.querySelector(".pill").innerText`)));
check("ページのエラーなし (全体)", errs.length === 0, errs.slice(0, 3).join(" | "));

ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
