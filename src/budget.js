// 予算の計算 (拡張のページと BOOTH のページの両方で使う。DOM に触れない)
// データは chrome.storage.local の "suki" に 1 つだけ置く。外には送らない。
(function (g) {
  "use strict";
  const KEY = "suki";
  const DEFAULTS = { budget: 10000, startDay: 1, purchases: [] };

  /** 日付が入っている予算の期間。startDay 日から翌月の startDay 日の前日まで */
  function periodOf(date, startDay) {
    const d = Math.min(Math.max(1, startDay | 0), 28);
    let y = date.getFullYear(), m = date.getMonth();
    if (date.getDate() < d) m -= 1;
    const start = new Date(y, m, d);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, d);
    return { start, end };
  }

  function summary(state, now = new Date()) {
    const s = { ...DEFAULTS, ...state };
    const { start, end } = periodOf(now, s.startDay);
    const inPeriod = s.purchases
      .filter(p => { const t = new Date(p.at); return t >= start && t < end; })
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    const spent = inPeriod.reduce((n, p) => n + (p.price | 0), 0);
    const remaining = s.budget - spent;
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
    return { budget: s.budget, spent, remaining, ratio: s.budget > 0 ? remaining / s.budget : 0, start, end, daysLeft, purchases: inPeriod };
  }

  /** 残りの割合から気分を決める (色と言い回しに使う) */
  function mood(remaining, budget) {
    if (remaining < 0) return "over";
    if (budget > 0 && remaining / budget < 0.3) return "low";
    return "ok";
  }

  const yen = n => (n < 0 ? "-" : "") + "¥" + Math.abs(Math.round(n)).toLocaleString("ja-JP");
  /** "¥ 1,500" → 1500。読めなければ null */
  function parseYen(text) {
    const m = /([\d,，]+)/.exec(String(text || "").replace(/\s/g, ""));
    if (!m) return null;
    const n = Number(m[1].replace(/[,，]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  /** 買ったら残りがどうなるかの一言 */
  function whisper(remaining, price) {
    const after = remaining - price;
    if (remaining < 0) return `もう予算を ${yen(-remaining)} こえてるよ… これでさらに ${yen(price)}。`;
    if (after < 0) return `今月の予算はあと ${yen(remaining)}。これを買うと ${yen(-after)} こえちゃうよ。`;
    if (price === 0) return `無料だね。今月の予算はあと ${yen(remaining)} のまま。`;
    return `今月の予算はあと ${yen(remaining)}。これを買うと残り ${yen(after)} だよ。`;
  }

  const fmtDate = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  async function load() {
    const r = await chrome.storage.local.get(KEY);
    return { ...DEFAULTS, ...(r[KEY] || {}) };
  }
  async function save(state) {
    await chrome.storage.local.set({ [KEY]: state });
  }
  async function addPurchase(p) {
    const s = await load();
    s.purchases.push({ id: newId(), at: new Date().toISOString(), source: "manual", ...p });
    await save(s);
    return s;
  }
  async function removePurchase(id) {
    const s = await load();
    s.purchases = s.purchases.filter(p => p.id !== id);
    await save(s);
    return s;
  }

  g.Suki = { KEY, DEFAULTS, periodOf, summary, mood, yen, parseYen, whisper, fmtDate, newId, load, save, addPurchase, removePurchase };
})(globalThis);
