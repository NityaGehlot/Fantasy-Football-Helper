import { test } from "node:test";
import assert from "node:assert/strict";
import { isRelayMessage, RELAY_TAG } from "../../extension/src/messages";
import { shouldWrite } from "../../extension/src/writeGate";
import type { CapturedTrade } from "../../extension/src/capture";

const t = (id: string, status = "proposed"): CapturedTrade => ({
  transactionId: id, leagueId: "1", status, type: "trade", creator: null, rosterIds: [1, 2],
  adds: {}, drops: {}, draftPicks: [], waiverBudget: [], created: null,
});

test("only our own relay messages are accepted", () => {
  assert.equal(isRelayMessage({ tag: RELAY_TAG, trades: [t("1")], seenGraphql: true }), true);
  assert.equal(isRelayMessage({ tag: "other", trades: [], seenGraphql: true }), false);
  assert.equal(isRelayMessage({ tag: RELAY_TAG, trades: "x", seenGraphql: true }), false);
  assert.equal(isRelayMessage({ tag: RELAY_TAG, trades: Array.from({ length: 201 }, (_, i) => t(String(i))), seenGraphql: true }), false);
  assert.equal(isRelayMessage("hello"), false);
});

test("a trade is saved at most every 30 seconds unless its status changes", () => {
  const last = new Map<string, { at: number; status: string }>();
  assert.equal(shouldWrite(last, t("9"), 0), true);
  last.set("9", { at: 0, status: "proposed" });
  assert.equal(shouldWrite(last, t("9"), 10_000), false);
  assert.equal(shouldWrite(last, t("9", "complete"), 10_000), true);
  assert.equal(shouldWrite(last, t("9"), 31_000), true);
});
