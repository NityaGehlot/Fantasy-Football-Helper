import { test } from "node:test";
import assert from "node:assert/strict";
import { findTrades, leagueIdFromUrl, toTransaction } from "../../extension/src/capture";

const trade = (id: string, extra: Record<string, unknown> = {}) => ({
  transaction_id: id, type: "trade", status: "proposed", roster_ids: [1, 4],
  adds: { "6794": 1 }, drops: { "6794": 4 }, creator: "u1", ...extra,
});
const payload = { data: { league_transactions_filtered: [trade("9", { leg: 10, league_id: "123", metadata: { secret: "x" } })] } };

test("finds a pending trade in a GraphQL response and keeps only trade fields", () => {
  const found = findTrades(payload);
  assert.equal(found.length, 1);
  assert.equal(found[0].transactionId, "9");
  assert.equal(found[0].leagueId, "123");
  assert.equal(found[0].status, "proposed");
  assert.deepEqual(found[0].rosterIds, [1, 4]);
  assert.ok(!("metadata" in found[0]) && !("leg" in found[0]));
});

test("ignores waivers, strings and duplicates", () => {
  const found = findTrades({ a: [{ transaction_id: "w", type: "waiver", roster_ids: [1] }, "text", trade("9"), trade("9")] });
  assert.deepEqual(found.map(t => t.transactionId), ["9"]);
});

test("falls back to the page's league id", () => {
  assert.equal(findTrades([trade("5")], "777")[0].leagueId, "777");
});

test("caps depth at 12 and results at 200, never throws", () => {
  let deep: any = trade("deep");
  for (let i = 0; i < 13; i++) deep = { x: deep };
  assert.deepEqual(findTrades(deep), []);
  const many = Array.from({ length: 250 }, (_, i) => trade(String(i)));
  assert.equal(findTrades(many).length, 200);
  assert.deepEqual(findTrades("not json"), []);
  assert.deepEqual(findTrades(null), []);
});

test("reads the league id from a Sleeper page URL", () => {
  assert.equal(leagueIdFromUrl("https://sleeper.com/leagues/1180/trades"), "1180");
  assert.equal(leagueIdFromUrl("https://sleeper.com/"), null);
});

test("converts back to Sleeper's transaction shape", () => {
  const tx = toTransaction(findTrades(payload)[0]) as any;
  assert.deepEqual(tx.roster_ids, [1, 4]);
  assert.equal(tx.transaction_id, "9");
  assert.equal(tx.type, "trade");
});
