// BOOTH のページに「今月の残り」を出す。商品ページでは種類ごとに「買うと残りいくら」を出し、
// カートに入れる前に一度だけ囁く。ページの中身は読むだけで、勝手に操作したりどこかへ送ったりはしない。
(function () {
  "use strict";
  if (window.top !== window || document.getElementById("suki-nefuda-root")) return;
  const S = globalThis.Suki;

  // ------------------------------------------------------------ ページを読む
  function itemInfo() {
    if (!/\/items\/\d+/.test(location.pathname)) return null;
    const og = document.querySelector('meta[property="og:title"]')?.content || document.title;
    const title = og.replace(/\s*-\s*BOOTH\s*$/, "").split(" - ")[0].trim();
    const variations = [...document.querySelectorAll("li.variation-item")].map((li, i) => {
      const price = S.parseYen(li.querySelector(".variation-price")?.textContent);
      const name = li.querySelector(".variation-name")?.textContent.trim() || "";
      return { index: i, name, price, li };
    }).filter(v => v.price != null);
    return { id: location.pathname.match(/\/items\/(\d+)/)[1], title, variations };
  }

  const textOf = el => (el?.textContent || "").replace(/\s+/g, " ").trim();
  /** 子を持たない要素のうち、文字が条件に合うもの (クラス名は変わりやすいので文字で探す) */
  const leaves = (re, root = document) => [...root.querySelectorAll("div, span, b, a, button")].filter(el => !el.children.length && re.test(textOf(el)));

  /** カート (ショップ.booth.pm/cart): ショップごとの合計 */
  function cartInfo() {
    if (!/\/cart\/?$/.test(location.pathname)) return null;
    const shops = leaves(/^このショップのレジに進む$/).map(btn => {
      const sheet = btn.closest(".sheet") || btn.parentElement?.parentElement?.parentElement;
      const kei = leaves(/^計$/, sheet)[0];
      const total = S.parseYen(textOf(kei?.parentElement?.nextElementSibling));
      return { shop: textOf(sheet?.querySelector(".break-all")), total };
    }).filter(x => x.total != null);
    return shops.length ? { shops, total: shops.reduce((n, x) => n + x.total, 0) } : null;
  }

  /** ご注文内容確認 (checkout.booth.pm/checkout/step3): お支払金額と商品ごとの小計 */
  function confirmInfo() {
    if (location.hostname !== "checkout.booth.pm" || !/\/checkout\/step3/.test(location.pathname)) return null;
    const label = leaves(/^お支払金額$/)[0];
    const total = S.parseYen(textOf(label?.closest(".legacy-list-item")?.querySelector(".legacy-list-item__right")));
    if (total == null) return null;
    const items = leaves(/^小計[:：]/).map(el => {
      const row = el.closest(".legacy-list-item");
      return { name: textOf(row?.querySelector(".u-tpg-slight-body")) || "BOOTH の商品", price: S.parseYen(textOf(el)) ?? 0 };
    });
    const uuid = document.querySelector('form[action*="/checkout/create"] input[name="uuid"]')?.value || "";
    return { total, items, uuid };
  }

  // ------------------------------------------------------------ 表示
  const host = document.createElement("div");
  host.id = "suki-nefuda-root";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host { all: initial; }
    .box { --bg:#ffffff; --fg:#1d2328; --sub:#66707a; --line:#e3e6ea; --ok:#1f9d6a; --low:#d48806; --over:#d64545; --btn:#f1f3f5;
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; font: 13px/1.6 "Hiragino Sans","Noto Sans JP",system-ui,sans-serif; color: var(--fg); }
    @media (prefers-color-scheme: dark) { .box { --bg:#1f2428; --fg:#e8ecef; --sub:#9aa5ae; --line:#353c42; --btn:#2b3238; } }
    .pill { display:flex; align-items:center; gap:8px; background:var(--bg); border:1px solid var(--line); border-radius:999px; padding:7px 14px; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.14); font: inherit; color: inherit; }
    .dot { width:9px; height:9px; border-radius:50%; background:var(--c); flex:none; }
    .pill b { font-variant-numeric: tabular-nums; }
    .panel { position:absolute; right:0; bottom:calc(100% + 8px); width:300px; max-height:70vh; overflow:auto; background:var(--bg); border:1px solid var(--line); border-radius:14px; box-shadow:0 10px 32px rgba(0,0,0,.2); padding:14px 16px; display:grid; gap:12px; }
    .panel[hidden], .whisper[hidden] { display:none; }
    .row { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
    .title { font-weight:700; }
    .sub { color:var(--sub); font-size:12px; }
    .big { font-size:24px; font-weight:700; color:var(--c); font-variant-numeric: tabular-nums; }
    .bar { height:6px; border-radius:3px; background:var(--line); overflow:hidden; }
    .bar i { display:block; height:100%; background:var(--c); }
    h4 { margin:0; font-size:12px; color:var(--sub); font-weight:600; }
    ul { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
    li { display:grid; grid-template-columns:1fr auto; gap:2px 8px; align-items:center; }
    li .n { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
    li .p { font-variant-numeric: tabular-nums; }
    li .a { grid-column:1; font-size:12px; color:var(--sub); }
    li .a.over { color:var(--over); }
    button.small { font:inherit; font-size:12px; border:1px solid var(--line); background:var(--btn); color:var(--fg); border-radius:8px; padding:2px 10px; cursor:pointer; }
    button.small:hover { border-color:var(--sub); }
    button:focus-visible { outline:2px solid var(--c); outline-offset:2px; }
    .whisper { position:absolute; right:0; bottom:calc(100% + 8px); width:300px; background:var(--bg); border:1.5px solid var(--c); border-radius:14px; box-shadow:0 10px 32px rgba(0,0,0,.22); padding:14px 16px; display:grid; gap:10px; }
    .whisper p { margin:0; font-size:14px; }
    .whisper .acts { display:flex; gap:8px; justify-content:flex-end; }
    .primary { background:var(--c) !important; color:#fff !important; border-color:var(--c) !important; }
  </style>
  <div class="box">
    <div class="whisper" hidden role="alertdialog" aria-live="assertive"></div>
    <div class="panel" hidden></div>
    <button class="pill" aria-expanded="false"><span class="dot"></span><span class="lbl">今月の残り</span><b class="rem">…</b></button>
  </div>`;
  document.documentElement.appendChild(host);
  const $ = s => root.querySelector(s);
  const box = $(".box"), panel = $(".panel"), pill = $(".pill"), wh = $(".whisper");
  const COLOR = { ok: "var(--ok)", low: "var(--low)", over: "var(--over)" };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let state = null;
  async function refresh() {
    state = await S.load();
    draw();
    noteOnArrival();
  }

  function draw() {
    const sm = S.summary(state);
    box.style.setProperty("--c", COLOR[S.mood(sm.remaining, sm.budget)]);
    $(".rem").textContent = S.yen(sm.remaining);
    const end = new Date(sm.end - 86400000);
    const used = sm.budget > 0 ? Math.min(100, Math.max(0, (sm.remaining / sm.budget) * 100)) : 0;
    const item = itemInfo();
    panel.innerHTML = `
      <div class="row"><span class="title">スキ値札</span><span class="sub">${S.fmtDate(sm.start)}〜${S.fmtDate(end)} · あと ${sm.daysLeft} 日</span></div>
      <div><div class="sub">今月の残り</div><div class="big">${S.yen(sm.remaining)}</div></div>
      <div class="bar" aria-hidden="true"><i style="width:${used}%"></i></div>
      <div class="row sub"><span>使った ${S.yen(sm.spent)}</span><span>予算 ${S.yen(sm.budget)}</span></div>
      ${item && item.variations.length ? `<h4>この商品を買うと</h4><ul>${item.variations.map(v => {
        const after = sm.remaining - v.price;
        return `<li><span class="n" title="${esc(v.name || item.title)}">${esc(v.name || item.title)}</span><span class="p">${S.yen(v.price)}</span>
          <span class="a${after < 0 ? " over" : ""}">残り ${S.yen(after)}</span><button class="small" data-buy="${v.index}">買った</button></li>`;
      }).join("")}</ul>` : ""}
      ${sm.purchases.length ? `<h4>今月買ったもの</h4><ul>${sm.purchases.slice(0, 4).map(p => `
        <li><span class="n" title="${esc(p.name)}">${esc(p.name)}</span><span class="p">${S.yen(p.price)}</span></li>`).join("")}</ul>` : ""}
      <div class="sub">予算と記録の編集は、ツールバーのスキ値札から。</div>`;
    panel.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", () => buy(item, item.variations[+b.dataset.buy])));
  }

  async function buy(item, v) {
    const name = v.name && item.variations.length > 1 ? `${item.title}（${v.name}）` : item.title;
    await S.addPurchase({ itemId: item.id, name, price: v.price, url: location.href.split("?")[0] });
  }

  /** 止めない囁き (閉じるだけ) */
  function note(text, after) {
    const sm = S.summary(state);
    box.style.setProperty("--c", COLOR[S.mood(after ?? sm.remaining, sm.budget)]);
    wh.innerHTML = `<p>${esc(text)}</p><div class="acts"><button class="small" data-act="close">閉じる</button></div>`;
    wh.querySelector("[data-act=close]").addEventListener("click", () => { wh.hidden = true; draw(); });
    panel.hidden = true;
    wh.hidden = false;
  }

  let noted = false;
  function noteOnArrival() {
    if (noted || !state || state.whisper === false) return;
    const sm = S.summary(state);
    const cf = confirmInfo();
    if (cf) {
      noted = true;
      note(`${S.whisper(sm.remaining, cf.total)} 注文を確定すると、自動で記録するね。`, sm.remaining - cf.total);
      return;
    }
    const cart = cartInfo();
    if (cart) {
      noted = true;
      const each = cart.shops.length > 1 ? `（${cart.shops.map(x => `${x.shop} ${S.yen(x.total)}`).join("、")}）` : "";
      note(`カートは全部で ${S.yen(cart.total)}${each}。${S.whisper(sm.remaining, cart.total)}`, sm.remaining - cart.total);
    }
  }

  // ------------------------------------------------------------ 注文を確定したら記録する (確定ボタンは止めない)
  let recorded = false;
  async function recordOrder() {
    const cf = confirmInfo();
    if (recorded || !cf) return;
    recorded = true;
    const s = await S.load();
    const key = cf.uuid || `t${Date.now()}`;
    if (s.purchases.some(p => p.orderKey === key)) return;
    const at = new Date().toISOString();
    const rows = cf.items.length ? cf.items.map(i => ({ ...i })) : [{ name: "BOOTH の注文", price: cf.total }];
    const rest = cf.total - rows.reduce((n, r) => n + r.price, 0);
    if (rest > 0) rows.push({ name: "手数料など", price: rest });
    for (const r of rows) s.purchases.push({ id: S.newId(), at, source: "checkout", orderKey: key, name: r.name, price: r.price });
    await S.save(s);
  }
  document.addEventListener("click", e => {
    if (e.target.closest?.('form[action*="/checkout/create"] [type="submit"]')) recordOrder();
  }, true);
  document.addEventListener("submit", e => {
    if (e.target.action?.includes("/checkout/create")) recordOrder();
  }, true);

  pill.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    wh.hidden = true;
    pill.setAttribute("aria-expanded", String(!panel.hidden));
  });

  // ------------------------------------------------------------ カートに入れる前に囁く
  let passThrough = false;
  document.addEventListener("click", e => {
    if (passThrough || !state) return;
    const btn = e.target.closest?.(".variation-cart button, .variation-cart input[type=submit], .variation-cart a");
    if (!btn) return;
    const item = itemInfo();
    const li = btn.closest("li.variation-item");
    const v = item?.variations.find(x => x.li === li);
    if (!v || state.whisper === false) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const sm = S.summary(state);
    box.style.setProperty("--c", COLOR[S.mood(sm.remaining - v.price, sm.budget)]);
    wh.innerHTML = `<p>${esc(S.whisper(sm.remaining, v.price))}</p>
      <div class="acts"><button class="small" data-act="stop">やめておく</button><button class="small primary" data-act="go">カートに入れる</button></div>`;
    panel.hidden = true;
    wh.hidden = false;
    wh.querySelector("[data-act=go]").focus();
    wh.querySelector("[data-act=stop]").addEventListener("click", () => { wh.hidden = true; draw(); });
    wh.querySelector("[data-act=go]").addEventListener("click", () => {
      wh.hidden = true;
      passThrough = true;
      btn.click();
      setTimeout(() => { passThrough = false; }, 1000);
    });
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes[S.KEY]) refresh(); });
  // 商品ページの種類は後から描かれることがあるので、少し待って描き直す
  refresh();
  // 商品ページの種類やカートの中身は後から描かれることがあるので、少し待ってもう一度
  setTimeout(() => { if (state) { draw(); noteOnArrival(); } }, 1500);
})();
