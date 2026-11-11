// キャラクターの通しの確認: 設定画面で VRM を入れる → BOOTH の商品ページに立つ → 囁くと動く → 予算をこえると表情が変わる
//   node test/avatar-e2e.mjs   (VRM は test/models/sample.vrm。なければ pixiv/three-vrm のサンプルを入れる)
//   VRM=~/Downloads/xxx.vrm node test/avatar-e2e.mjs   で自分の VRM でも試せる
// スクリーンショットは test/out/。カートには実際には入れない。
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MODEL = resolve(process.env.VRM || "test/models/sample.vrm");
if (!process.env.VRM && !existsSync(MODEL)) {
  mkdirSync("test/models", { recursive: true });
  execFileSync("curl", ["-sL", "-o", MODEL, "https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm"]);
}
const OUT = "test/out"; mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--remote-debugging-port=9336", `--user-data-dir=${mkdtempSync(join(tmpdir(), "suki-"))}`,
  "--no-first-run", "--window-size=1280,900", "--enable-unsafe-extension-debugging",
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "about:blank"], { stdio: "ignore" });
let t; for (let i = 0; i < 50; i++) { try { t = await (await fetch("http://127.0.0.1:9336/json")).json(); break; } catch { await sleep(200); } }
const bws = new WebSocket((await (await fetch("http://127.0.0.1:9336/json/version")).json()).webSocketDebuggerUrl);
await new Promise(r => bws.onopen = r);
const loaded = await new Promise(r => { bws.onmessage = e => r(JSON.parse(e.data)); bws.send(JSON.stringify({ id: 1, method: "Extensions.loadUnpacked", params: { path: resolve("src") } })); });
if (loaded.error) { console.log("拡張を入れられません:", loaded.error.message); chrome.kill(); process.exit(2); }
const EXT = loaded.result.id;
const ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { pend.get(m.id)?.(m); return; } if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; };
const shot = async (n, clip) => writeFileSync(join(OUT, n), Buffer.from((await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })).result.data, "base64"));
let fails = 0; const check = (n, ok, x = "") => { if (!ok) fails++; console.log(`${ok ? "ok" : "NG"}  ${n}${x ? "  " + x : ""}`); };
const sr = `document.getElementById("suki-nefuda-root")?.shadowRoot`;
await send("Runtime.enable"); await send("Page.enable"); await send("DOM.enable");

// 1. 設定画面で VRM を入れる
await send("Page.navigate", { url: `chrome-extension://${EXT}/options.html` }); await sleep(1000);
const doc = await send("DOM.getDocument");
const input = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#file" });
await send("DOM.setFileInputFiles", { nodeId: input.result.nodeId, files: [MODEL] });
await sleep(4000);
const msg = await ev(`document.querySelector("#msg").textContent + " | " + document.querySelector("#name").textContent + " | " + document.querySelector("#detail").textContent`);
check("設定画面で VRM を入れる", /設定しました/.test(msg), msg);
await shot("5-options.png");

// 1b. 大きく映して細かいところを見る (目・髪と顔の重なり・服の裏)
await send("Emulation.setDeviceMetricsOverride", { width: 600, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `chrome-extension://${EXT}/avatar.html` }); await sleep(5000);
await shot("4b-closeup.png");
await send("Emulation.clearDeviceMetricsOverride");

// 2. BOOTH の商品ページに立つ
await send("Page.navigate", { url: "https://booth.pm/ja/items/4493526" }); await sleep(7000);
const shown = await ev(`({ cls: ${sr}.querySelector(".box").className, waiting: ${sr}.querySelector(".avatar")?.classList.contains("waiting") })`);
check("商品ページにキャラクターが立つ", shown.waiting === false && /has-avatar/.test(shown.cls), JSON.stringify(shown));
const clip = { x: 800, y: 480, width: 480, height: 420 };
await shot("6-standing.png", clip);

// 3. カートに入れようとすると、囁いて口を動かす (実際には入れない)
await ev(`document.querySelector(".variation-cart button, .variation-cart input[type=submit]").click()`); await sleep(700);
check("囁きが吹き出しになる", /今月の予算はあと/.test(await ev(`${sr}.querySelector(".whisper").innerText`)));
await shot("7-talking.png", clip);
await ev(`${sr}.querySelector(".whisper [data-act=stop]").click()`);

// 4. 予算をこえたら、むっとする
await ev(`new Promise(r => { const ifr = ${sr}.querySelector(".avatar"); r(true); })`);
await send("Page.navigate", { url: `chrome-extension://${EXT}/popup.html` }); await sleep(800);
await ev(`(async () => { const s = await Suki.load(); s.budget = 1000; s.purchases.push({ id: "x", at: new Date().toISOString(), name: "テスト", price: 3000 }); await Suki.save(s); })()`);
await send("Page.navigate", { url: "https://booth.pm/ja/items/4493526" }); await sleep(7000);
check("予算をこえると残りが赤", /-¥2,000/.test(await ev(`${sr}.querySelector(".pill").innerText`)));
await shot("8-over.png", clip);

check("エラーなし", errs.length === 0, errs.slice(0, 3).join(" | "));
ws.close(); bws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
