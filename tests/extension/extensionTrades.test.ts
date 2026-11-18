import { test } from "node:test";
import assert from "node:assert/strict";
import { freshExtensionTrades, seenAgo, type ExtensionTrade } from "../../app/services/extensionTrades";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const t = (id: string, status: string, seenAt: number): ExtensionTrade => ({
  transactionId: id, leagueId: "1", status, type: "trade", creator: null, rosterIds: [1, 2],
  adds: {}, drops: {}, draftPicks: [], waiverBudget: [], created: null, seenAt,
});

test("only pending offers seen in the last 14 days, newest first", () => {
  const out = freshExtensionTrades(
    [t("old", "proposed", NOW - 15 * DAY), t("done", "complete", NOW), t("a", "proposed", NOW - DAY), t("b", "pending", NOW - 1000)],
    NOW
  );
  assert.deepEqual(out.map(x => x.transactionId), ["b", "a"]);
});

test("seen times read naturally", () => {
  assert.equal(seenAgo(NOW - 59_000, NOW), "just now");
  assert.equal(seenAgo(NOW - 3 * 60_000, NOW), "3m ago");
  assert.equal(seenAgo(NOW - 2 * 3_600_000, NOW), "2h ago");
  assert.equal(seenAgo(NOW - 4 * DAY, NOW), "4d ago");
});

import { offerSourceLabel, draftPickLines } from "../../app/services/extensionTrades";

test("offers from the extension say where they came from", () => {
  const seen = new Map([["9", NOW - 3 * 60_000]]);
  assert.equal(offerSourceLabel({ transactionId: "9", source: "extension" }, seen, NOW), "via browser extension · seen 3m ago");
  assert.equal(offerSourceLabel({ transactionId: "9", source: "extension" }, new Map(), NOW), "via browser extension");
  assert.equal(offerSourceLabel({ transactionId: "8", source: "sleeper" }, seen, NOW), "");
});

test("draft picks in a trade read as text for each side", () => {
  const picks = [
    { season: "2027", round: 2, roster_id: 4, owner_id: 1, previous_owner_id: 4 },
    { season: "2026", round: 1, roster_id: 1, owner_id: 4, previous_owner_id: 1 },
  ];
  assert.deepEqual(draftPickLines(picks, 1), { get: ["2027 2nd round pick"], give: ["2026 1st round pick"] });
  assert.deepEqual(draftPickLines(undefined, 1), { get: [], give: [] });
});

import { newlyLinked } from "../../app/services/extensionTrades";

test("a browser counts as just linked when it's new or its link time changed", () => {
  const before = new Map([["e1", 100]]);
  assert.equal(newlyLinked(before, [{ id: "e1", linkedAt: 100 }]), false);
  assert.equal(newlyLinked(before, [{ id: "e1", linkedAt: 250 }]), true); // same browser re-linked
  assert.equal(newlyLinked(before, [{ id: "e1", linkedAt: 100 }, { id: "e2", linkedAt: 5 }]), true);
  assert.equal(newlyLinked(before, []), false);
});
