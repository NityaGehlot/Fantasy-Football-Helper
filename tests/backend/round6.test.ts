import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLineups } from "../../app/backend/services/lineupCheck";

const pl = (id: string, name: string, position: string, value: number, injuryStatus = "ACTIVE") => ({ id, name, position, team: "CHI", injuryStatus, value });

test("lineup check: an empty QB spot is filled by a QB, and a WR is only swapped for someone who can play his spot", () => {
  // Your QB spot is empty in Sleeper; Shakir (WR) is in FLEX; Caleb (QB) and Loveland (TE) sit on the bench.
  const players = [
    pl("caleb", "Caleb Williams", "QB", 15.9),
    pl("shakir", "Khalil Shakir", "WR", 10.9),
    pl("loveland", "Colston Loveland", "TE", 12.0),
    pl("wr1", "WR One", "WR", 14),
    pl("te1", "TE One", "TE", 13),
  ];
  const slots = ["QB", "WR", "TE", "FLEX"] as any;
  const out = compareLineups(players, ["0", "wr1", "te1", "shakir"], slots);
  assert.deepEqual(out.emptySlots, ["QB"]);
  const qb = out.swaps.find(s => s.slot === "QB")!;
  assert.equal(qb.start.name, "Caleb Williams");
  assert.equal(qb.bench, null); // fills the empty spot, nobody benched
  const flex = out.swaps.find(s => s.slot === "FLEX")!;
  assert.equal(flex.start.name, "Colston Loveland");
  assert.equal(flex.bench?.name, "Khalil Shakir");
  // Never pair a QB with a WR's spot.
  assert.ok(!out.swaps.some(s => s.start.position === "QB" && s.bench?.position === "WR"));
  assert.equal(out.bestPoints, 15.9 + 14 + 13 + 12);
});

test("lineup check: players who change slots are labeled as moves", () => {
  const players = [pl("a", "WR A", "WR", 20), pl("b", "WR B", "WR", 5), pl("c", "RB C", "RB", 12), pl("d", "RB D", "RB", 15)];
  // A is in FLEX and B in WR; best is A at WR and D at FLEX.
  const out = compareLineups(players, ["c", "b", "a"], ["RB", "WR", "FLEX"] as any);
  const wr = out.swaps.find(s => s.slot === "WR")!;
  assert.equal(wr.start.name, "WR A");
  assert.equal(wr.from, "FLEX");
  const flex = out.swaps.find(s => s.slot === "FLEX")!;
  assert.equal(flex.bench?.name, "WR A");
  assert.equal(flex.movesTo, "WR");
});

import { incompatibleStartSitReply, sharedSlots } from "../../app/backend/utils/slotCompat";

test("start/sit: players who can't share a lineup spot get an explanation and real options", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN"];
  assert.deepEqual(sharedSlots("RB", "WR", slots), ["FLEX"]);
  assert.deepEqual(sharedSlots("QB", "WR", slots), []);
  assert.deepEqual(sharedSlots("QB", "WR", [...slots, "SUPER_FLEX"]), ["SUPER_FLEX"]);
  const roster = [
    { fullName: "Caleb Williams", position: "QB" },
    { fullName: "Bryce Young", position: "QB" },
    { fullName: "Khalil Shakir", position: "WR" },
    { fullName: "Colston Loveland", position: "TE" },
  ];
  const reply = incompatibleStartSitReply({ name: "caleb williams", position: "QB" }, { name: "khalil shakir", position: "WR" }, slots, roster)!;
  assert.match(reply, /Caleb Williams \(QB\) and Khalil Shakir \(WR\) can't take each other's spot/);
  assert.match(reply, /Compare Caleb Williams with: Bryce Young \(QB\)/);
  assert.match(reply, /Compare Khalil Shakir with: Colston Loveland \(TE\)/); // via FLEX
  assert.equal(incompatibleStartSitReply({ name: "a", position: "RB" }, { name: "b", position: "WR" }, slots, roster), null);
  assert.match(incompatibleStartSitReply({ name: "ja'marr chase", position: "WR" }, { name: "x y", position: "QB" }, slots)!, /Ja'Marr Chase/);
});

import { counterOffers, gradeTrade, tradeForPlayer } from "../../app/backend/services/tradeGrade";

const tp = (id: string, position: string, value: number) => ({ id, name: `P${id}`, position, team: "KC", injuryStatus: "ACTIVE", value });
const me = { rosterId: 1, ownerId: "u1", teamName: "Me", players: [tp("1", "RB", 15), tp("2", "RB", 6), tp("3", "WR", 12), tp("4", "WR", 5), tp("5", "TE", 7)] };
const them = { rosterId: 2, ownerId: "u2", teamName: "Them", players: [tp("6", "RB", 9), tp("7", "WR", 17), tp("8", "WR", 6), tp("9", "RB", 7), tp("10", "TE", 11)] };
const slots = ["RB", "WR", "TE", "FLEX"] as any;

test("bad offers come with counter-offers that are better for you", () => {
  // They offer their 7-point RB for your 15-point RB: bad for you.
  const g = gradeTrade(me, them, [me.players[0]], [them.players[3]], slots);
  assert.ok(["D", "F"].includes(g.grade), g.grade);
  assert.ok(g.counters.length > 0);
  for (const c of g.counters) {
    assert.ok(c.idea.myGain >= 0.3, String(c.idea.myGain));
    assert.ok(c.idea.theirGain >= -(2 + Math.abs(g.idea.theirGain)), String(c.idea.theirGain));
  }
  assert.match(g.counters[0].summary, /^(Give|Ask for)/);
  // Good offers don't need counters.
  const good = gradeTrade(me, them, [me.players[3]], [them.players[1]], slots);
  assert.equal(good.verdict, "accept");
  assert.equal(good.counters.length, 0);
  assert.deepEqual(counterOffers(me, them, [], [], slots, good.idea, 0), []);
});

test("trade for a player on another team always targets that player", () => {
  const ideas = tradeForPlayer(me, them, "7", slots);
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every(i => i.get.some(p => p.id === "7")));
  assert.deepEqual(tradeForPlayer(me, them, "missing", slots), []);
});
