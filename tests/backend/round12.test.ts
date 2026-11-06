import { test } from "node:test";
import assert from "node:assert/strict";
import { claimsFromTransactions, faabBid, priorityAdvice, waiverSummary } from "../../app/backend/services/waiverAdvice";
import { parseEspnNews } from "../../app/backend/services/leagueNews";

test("FAAB: suggested bid from what similar players went for in the league", () => {
  const players = new Map([
    ["a", { position: "RB", value: 9 }], ["b", { position: "RB", value: 10 }], ["c", { position: "RB", value: 8 }],
    ["d", { position: "RB", value: 11 }], ["e", { position: "WR", value: 9 }],
  ]);
  const tx = [
    { type: "waiver", status: "complete", leg: 2, adds: { a: 1 }, settings: { waiver_bid: 12 } },
    { type: "waiver", status: "complete", leg: 3, adds: { b: 2 }, settings: { waiver_bid: 18 } },
    { type: "waiver", status: "complete", leg: 4, adds: { c: 3 }, settings: { waiver_bid: 8 } },
    { type: "waiver", status: "complete", leg: 5, adds: { d: 4 }, settings: { waiver_bid: 22 } },
    { type: "waiver", status: "failed", leg: 5, adds: { d: 5 }, settings: { waiver_bid: 15 } },
    { type: "waiver", status: "complete", leg: 6, adds: { e: 1 }, settings: { waiver_bid: 40 } },
    { type: "free_agent", status: "complete", adds: { x: 1 } },
  ];
  const claims = claimsFromTransactions(tx, players);
  assert.equal(claims.length, 6);
  assert.equal(claims.filter(c => c.won).length, 5);
  const bid = faabBid({ target: { position: "RB", value: 9.5 }, claims, budget: 100, remaining: 60, leagueRemainingAvg: 100, starterValue: 10 });
  assert.equal(bid.comparables, 4); // the 4 RBs; the WR at $40 doesn't count
  assert.ok(bid.low <= bid.likely && bid.likely <= bid.high);
  assert.equal(bid.likely, 15); // median of 8, 12, 18, 22
  assert.match(bid.basis, /4 RBs like him/);
  // Budgets shrink: with half the league's money spent, bids scale down; never above what you have.
  const late = faabBid({ target: { position: "RB", value: 9.5 }, claims, budget: 100, remaining: 5, leagueRemainingAvg: 50, starterValue: 10 });
  assert.ok(late.likely <= 5 && late.high <= 5);
});

test("FAAB with little league history uses common guidance", () => {
  const starter = faabBid({ target: { position: "WR", value: 14 }, claims: [], budget: 100, remaining: 100, leagueRemainingAvg: 100, starterValue: 10 });
  assert.equal(starter.likely, 20);
  assert.match(starter.basis, /15-25%/);
  const stash = faabBid({ target: { position: "WR", value: 4 }, claims: [], budget: 100, remaining: 100, leagueRemainingAvg: 100, starterValue: 10 });
  assert.equal(stash.likely, 2);
});

test("rolling waivers: only spend priority on a real upgrade", () => {
  assert.equal(priorityAdvice({ position: 2, teams: 10, lineupGain: 3.5, topPickup: true }).useClaim, true);
  const depth = priorityAdvice({ position: 8, teams: 10, lineupGain: 0, topPickup: false, dropName: "Caleb Williams" });
  assert.equal(depth.useClaim, false);
  assert.match(depth.basis, /wouldn't improve your starting lineup/);
  const small = priorityAdvice({ position: 2, teams: 10, lineupGain: 0.3, topPickup: false });
  assert.equal(small.useClaim, false); // high priority: save it
  assert.match(small.basis, /save your high priority|depth/);
  const lowPriority = priorityAdvice({ position: 9, teams: 10, lineupGain: 0.6, topPickup: false });
  assert.equal(lowPriority.useClaim, true);
  const text = waiverSummary({ type: "rolling", ...lowPriority, lineupGain: 0.6, summary: "" } as any, "Adonai Mitchell");
  assert.match(text, /^You're #9 of 10 in waiver priority\. Claim Adonai Mitchell:/);
});

test("ESPN videos with a cover are kept and marked as video", () => {
  const out = parseEspnNews({
    articles: [
      { id: 1, type: "Media", headline: "Highlights", images: [{ url: "https://x/cover.jpg" }], links: { web: { href: "https://espn.com/video/1" } } },
      { id: 2, type: "Media", headline: "No cover", images: [], links: { web: { href: "https://espn.com/video/2" } } },
      { id: 3, type: "Story", headline: "A story", images: [{ url: "https://x/s.jpg" }], links: { web: { href: "https://espn.com/s/3" } } },
    ],
  });
  assert.deepEqual(out.map(a => [a.headline, !!a.video]), [["Highlights", true], ["A story", false]]);
});
