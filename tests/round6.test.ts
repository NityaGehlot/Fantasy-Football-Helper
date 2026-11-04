import { test } from "node:test";
import assert from "node:assert/strict";
import { practiceTable } from "../app/services/injuryFormat";
import { latestInjuryNews } from "../app/services/injuryNews";
import { ownershipLabel, ownershipMap } from "../app/services/leagueOwnership";
import { tradeOfferNotification } from "../app/services/notifications";
import { counterMessage } from "../app/services/tradeGrader";

test("injury table: no report days and carried-over statuses are labeled", () => {
  const rows = practiceTable([
    { date: "2026-11-03", day: "Tue", status: "QUESTIONABLE" },
    { date: "2026-11-04", day: "Wed", status: "QUESTIONABLE", practice_status: "DNP" },
    { date: "2026-11-06", day: "Fri", status: "QUESTIONABLE", practice_status: "LP", game_status: "DOUBTFUL" },
  ] as any);
  assert.equal(rows[0].practiceLabel, "No report");
  assert.equal(rows[0].status, "Questionable (last game)");
  assert.equal(rows[1].practiceLabel, "Did not practice");
  assert.equal(rows[2].status, "Doubtful");
});

test("latest injury news about a player (the Tuten case)", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const items = [
    { title: "Fantasy Football: Bhayshul Tuten bringing the explosives", player: "Bhayshul Tuten", published: "2026-11-02", category: "fantasy_advice", impact: "neutral" },
    { title: "Bhayshul Tuten remains out of practice for the Jaguars", player: "Bhayshul Tuten", published: "2026-11-03", category: "injury", impact: "negative" },
    { title: "Tuten (ankle/foot) not spotted on Tuesday", player: "Bhayshul Tuten", published: "2026-11-03", category: "injury", impact: "negative" },
    { title: "Old injury", player: "Bhayshul Tuten", published: "2026-10-01", category: "injury" },
    { title: "Other player hurt", player: "Someone Else", published: "2026-11-04", category: "injury" },
  ];
  const n = latestInjuryNews(items as any, "Bhayshul Tuten", now)!;
  assert.match(n.title, /out of practice|not spotted/);
  assert.equal(latestInjuryNews(items as any, "Nobody", now), null);
  assert.equal(latestInjuryNews([items[3]] as any, "Bhayshul Tuten", now), null); // too old
});

test("trending players show which team in your league has them", () => {
  const map = ownershipMap(
    [
      { roster_id: 1, owner_id: "u1", players: ["a"], reserve: ["r"] },
      { roster_id: 2, owner_id: "u2", players: ["b"] },
    ],
    [{ user_id: "u1", display_name: "nitya" }, { user_id: "u2", display_name: "bob", metadata: { team_name: "Bob's Bombers" } }],
    "u1"
  );
  assert.equal(ownershipLabel(map.get("a"), true), "On your team");
  assert.equal(ownershipLabel(map.get("r"), true), "On your team"); // IR players count
  assert.equal(ownershipLabel(map.get("b"), true), "On Bob's Bombers");
  assert.equal(ownershipLabel(map.get("z"), true), "Free agent in your league");
  assert.equal(ownershipLabel(undefined, false), "");
});

test("trade offer notifications are good or bad by grade, with an AI question", () => {
  const base = { leagueId: "L", leagueName: "My League", now: "2026-11-04T12:00:00Z" };
  const bad = tradeOfferNotification(base, { transactionId: "t1", partnerName: "Bob", grade: "F", headline: "Decline.", give: ["A"], get: ["B"], counters: 2 });
  assert.equal(bad.tone, "bad");
  assert.equal(bad.target, "Trades");
  assert.match(bad.body, /2 counter-offers suggested/);
  assert.match(bad.aiQuestion!, /Bob offered me B for A/);
  assert.equal(tradeOfferNotification(base, { transactionId: "t2", partnerName: "Bob", grade: "A", headline: "Accept.", give: [], get: [], counters: 0 }).tone, "good");
});

test("counter-offer message", () => {
  const msg = counterMessage("Bob", {
    summary: "Ask for X too.",
    idea: { give: [{ name: "A" }], get: [{ name: "B" }, { name: "X" }], theirGain: 1.2 } as any,
  });
  assert.match(msg, /how about my A for your B and X\?/);
  assert.match(msg, /about 1.2 points a week better/);
});
