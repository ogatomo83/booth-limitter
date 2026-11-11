"use strict";
const S = globalThis.Suki;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLOR = { ok: "var(--ok)", low: "var(--low)", over: "var(--over)" };

for (let d = 1; d <= 28; d++) $("#startDay").append(new Option(`${d} 日から`, d));

let state;
async function render() {
  state = await S.load();
  const sm = S.summary(state);
  document.body.style.setProperty("--c", COLOR[S.mood(sm.remaining, sm.budget)]);
  $("#period").textContent = `${S.fmtDate(sm.start)}〜${S.fmtDate(new Date(sm.end - 86400000))}`;
  $("#rem").textContent = S.yen(sm.remaining);
  $("#bar").style.width = `${sm.budget > 0 ? Math.min(100, Math.max(0, sm.remaining / sm.budget * 100)) : 0}%`;
  $("#spent").textContent = `使った ${S.yen(sm.spent)} / 予算 ${S.yen(sm.budget)}`;
  $("#days").textContent = `あと ${sm.daysLeft} 日`;
  if (document.activeElement !== $("#budget")) $("#budget").value = state.budget;
  $("#startDay").value = state.startDay;
  $("#whisper").checked = state.whisper !== false;
  $("#list").innerHTML = sm.purchases.length ? sm.purchases.map(p => `<li>
      <span class="d">${S.fmtDate(new Date(p.at))}</span>
      <span class="n" title="${esc(p.name)}">${p.url ? `<a href="${esc(p.url)}" target="_blank">${esc(p.name)}</a>` : esc(p.name)}</span>
      <span class="p">${S.yen(p.price)}</span>
      <button class="x" data-del="${esc(p.id)}" title="この記録を消す" aria-label="${esc(p.name)} の記録を消す">×</button></li>`).join("")
    : `<li class="empty">まだありません。商品ページの右下から「買った」を押すと記録されます。</li>`;
  document.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { await S.removePurchase(b.dataset.del); }));
  // 過去の期間ごとの合計
  const byPeriod = new Map();
  for (const p of state.purchases) {
    const { start } = S.periodOf(new Date(p.at), state.startDay);
    const k = `${start.getFullYear()}年${start.getMonth() + 1}月`;
    byPeriod.set(k, (byPeriod.get(k) || 0) + (p.price | 0));
  }
  const months = [...byPeriod].sort((a, b) => b[0].localeCompare(a[0], "ja", { numeric: true })).slice(0, 12);
  $("#months").innerHTML = months.length ? months.map(([k, v]) => `<li><span>${k}</span><span class="p">${S.yen(v)}</span></li>`).join("") : `<li class="empty">まだありません。</li>`;
}

async function patch(f) { const s = await S.load(); f(s); await S.save(s); }
$("#budget").addEventListener("change", e => patch(s => { s.budget = Math.max(0, +e.target.value || 0); }));
$("#startDay").addEventListener("change", e => patch(s => { s.startDay = +e.target.value; }));
$("#whisper").addEventListener("change", e => patch(s => { s.whisper = e.target.checked; }));
$("#add").addEventListener("submit", async e => {
  e.preventDefault();
  await S.addPurchase({ name: $("#addName").value.trim(), price: Math.max(0, +$("#addPrice").value || 0) });
  e.target.reset();
});
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c[S.KEY]) render(); });
render();
