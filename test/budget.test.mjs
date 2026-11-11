// 予算の計算の単体テスト (node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
new Function(readFileSync(new URL("../extension/budget.js", import.meta.url), "utf8"))();
const S = globalThis.Suki;

test("月の始まりで期間が決まる", () => {
  const p = S.periodOf(new Date(2026, 10, 11), 1);
  assert.deepEqual([p.start, p.end], [new Date(2026, 10, 1), new Date(2026, 11, 1)]);
  const q = S.periodOf(new Date(2026, 10, 11), 25); // 給料日が 25 日
  assert.deepEqual([q.start, q.end], [new Date(2026, 9, 25), new Date(2026, 10, 25)]);
  const r = S.periodOf(new Date(2026, 0, 3), 25); // 年をまたぐ
  assert.deepEqual([r.start, r.end], [new Date(2025, 11, 25), new Date(2026, 0, 25)]);
});

test("今月の分だけ数える", () => {
  const now = new Date(2026, 10, 11, 12);
  const s = { budget: 10000, startDay: 1, purchases: [
    { id: "a", name: "衣装", price: 3000, at: new Date(2026, 10, 2).toISOString() },
    { id: "b", name: "髪", price: 1500, at: new Date(2026, 10, 10).toISOString() },
    { id: "c", name: "先月の", price: 9000, at: new Date(2026, 9, 31).toISOString() },
  ] };
  const sm = S.summary(s, now);
  assert.equal(sm.spent, 4500);
  assert.equal(sm.remaining, 5500);
  assert.deepEqual(sm.purchases.map(p => p.id), ["b", "a"]);
  assert.equal(sm.daysLeft, 20);
  assert.equal(S.mood(5500, 10000), "ok");
  assert.equal(S.mood(2000, 10000), "low");
  assert.equal(S.mood(-1, 10000), "over");
});

test("値段を読む", () => {
  assert.equal(S.parseYen("¥ 1,500"), 1500);
  assert.equal(S.parseYen("¥0"), 0);
  assert.equal(S.parseYen("１，２００円".normalize("NFKC")), 1200);
  assert.equal(S.parseYen("価格未定"), null);
  assert.equal(S.yen(-2500), "-¥2,500");
});

test("囁き", () => {
  assert.match(S.whisper(5000, 1500), /あと ¥5,000。これを買うと残り ¥3,500/);
  assert.match(S.whisper(1000, 1500), /¥500 こえちゃう/);
  assert.match(S.whisper(-200, 800), /もう予算を ¥200 こえてる/);
  assert.match(S.whisper(3000, 0), /無料/);
});
