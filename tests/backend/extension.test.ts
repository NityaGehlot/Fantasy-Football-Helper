import { test } from "node:test";
import assert from "node:assert/strict";
import { validateExtraTransactions, mergeTransactions } from "../../app/backend/utils/extraTransactions";
import { pendingTradesFor } from "../../app/backend/services/tradeGrade";

const tx = (id: string, extra: Record<string, unknown> = {}) => ({
  transaction_id: id, type: "trade", status: "proposed", roster_ids: [1, 4], creator: "u4",
  adds: { a: 1, b: 4 }, drops: { a: 4, b: 1 }, draft_picks: [], ...extra,
});

test("extension trades: at most 50, must be trades involving your roster", () => {
  assert.equal(validateExtraTransactions(Array.from({ length: 60 }, (_, i) => tx(String(i))), 1).length, 50);
  assert.deepEqual(validateExtraTransactions([tx("x", { roster_ids: [2, 3] })], 1), []);
  assert.deepEqual(validateExtraTransactions([tx("x", { adds: { "1": "x" } })], 1), []);
  assert.deepEqual(validateExtraTransactions([tx("x", { type: "waiver" })], 1), []);
  assert.deepEqual(validateExtraTransactions("nope", 1), []);
});

test("a trade Sleeper already finished doesn't show as pending", () => {
  const merged = mergeTransactions([tx("9", { status: "complete" })], [tx("9")]);
  assert.deepEqual(pendingTradesFor(merged, 1, "u1", new Set(["9"])), []);
});

test("extension-only trades are marked as coming from the extension", () => {
  const merged = mergeTransactions([], validateExtraTransactions([tx("9")], 1));
  const [t] = pendingTradesFor(merged, 1, "u1", new Set(["9"]));
  assert.equal(t.source, "extension");
  assert.equal(t.direction, "received");
  assert.deepEqual(t.get, ["a"]);
  assert.deepEqual(t.give, ["b"]);
});

test("draft-pick-only trades are kept with their picks", () => {
  const pick = { season: "2027", round: 2, roster_id: 4, owner_id: 1, previous_owner_id: 4 };
  const merged = mergeTransactions([], validateExtraTransactions([tx("p", { adds: {}, drops: {}, draft_picks: [pick] })], 1));
  const [t] = pendingTradesFor(merged, 1, "u1", new Set(["p"]));
  assert.deepEqual(t.give, []);
  assert.deepEqual(t.get, []);
  assert.deepEqual(t.draftPicks, [pick]);
});

import { tradeFitsLeague } from "../../app/backend/utils/extraTransactions";

test("extension trades must only move players from this league's rosters", () => {
  const rostered = new Set(["a", "b", "c"]);
  assert.equal(tradeFitsLeague(tx("1"), rostered), true);
  assert.equal(tradeFitsLeague(tx("2", { adds: { zz: 1 }, drops: { zz: 4 } }), rostered), false); // another league's player
  assert.equal(tradeFitsLeague(tx("3", { adds: {}, drops: {} }), rostered), true); // picks only
});
