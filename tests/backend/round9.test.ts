import { test } from "node:test";
import assert from "node:assert/strict";
import { alignStarters } from "../../app/backend/services/lineup";
import { decide, tierOf } from "../../app/backend/services/lineupFactors";
import { compareLineups, findCloseCalls } from "../../app/backend/services/lineupCheck";
import { gradeProposal } from "../../app/backend/services/tradeGrade";
import { toStatRows } from "../../app/backend/services/sleeperServer";

const pl = (id: string, name: string, position: string, value: number, extra: Record<string, any> = {}) => ({
  id, name, position, team: "X", injuryStatus: "ACTIVE", value, ...extra,
});
const rank = (pos: string, position: number) => ({ points: 100, games: 9, overall: position * 3, position, pos, positionCount: 60 });

test("starters line up with their slots even when the league has slots the app doesn't model", () => {
  // QB, RB, RB, WR, DL (IDP), FLEX, BN...: Sleeper's starters follow every starting spot.
  const out = alignStarters(["QB", "RB", "RB", "WR", "DL", "FLEX", "BN", "BN", "IR"], ["qb", "rb1", "rb2", "wr1", "dl1", "rb3"]);
  assert.deepEqual(out.slots, ["QB", "RB", "RB", "WR", "FLEX"]);
  assert.deepEqual(out.ids, ["qb", "rb1", "rb2", "wr1", "rb3"]);
  // Without the alignment the FLEX starter (rb3) would sit in "FLEX" while dl1 took his place;
  // with it, a QB can never be suggested for an RB spot.
  const players = [pl("qb", "QB", "QB", 20), pl("qb2", "Backup QB", "QB", 30), pl("rb1", "RB1", "RB", 10), pl("rb2", "RB2", "RB", 9), pl("wr1", "WR1", "WR", 8), pl("rb3", "RB3", "RB", 7)];
  const check = compareLineups(players, out.ids, out.slots);
  for (const s of check.swaps) assert.ok(!(s.start.position === "QB" && s.slot !== "QB"), `QB suggested for ${s.slot}`);
  assert.equal(check.swaps[0].start.name, "Backup QB");
  assert.equal(check.swaps[0].slot, "QB");
});

test("tough defense barely matters for an elite player, more for a low-ranked one; weak defense helps anyone", () => {
  const tough = { defense: -0.1, weather: 0, injury: 0, defenseRank: 1, defenseTeams: 32 };
  const weak = { defense: 0.1, weather: 0, injury: 0, defenseRank: 32, defenseTeams: 32 };
  assert.equal(tierOf("WR", rank("WR", 5)), "elite");
  assert.equal(tierOf("WR", rank("WR", 50)), "depth");
  const elite = decide(15, "WR", tough, rank("WR", 5));
  const mid = decide(15, "WR", tough, rank("WR", 20));
  const low = decide(15, "WR", tough, rank("WR", 50));
  assert.ok(elite.score > mid.score && mid.score > low.score);
  assert.equal(elite.score, 14.48); // -3.5%
  assert.match(elite.reasons.join(" "), /WR5 this season, so you start him anyway/);
  assert.match(low.reasons.join(" "), /only WR50 this season: risky/);
  const plus = decide(10, "WR", weak, rank("WR", 50));
  assert.equal(plus.score, 11);
  assert.match(plus.reasons.join(" "), /Weak defense/);
});

test("injuries around a player change the decision and are explained", () => {
  // Backup QB starting (-2 for a WR = -12%) vs the lead RB being out for an RB2 (+2 = +12%).
  const wr = decide(12, "WR", { defense: 0, weather: 0, injury: -0.12, defenseRank: null, defenseTeams: 32 }, rank("WR", 20), [
    "Teammate J. Starter (QB) is out: the backup QB is less accurate and throws for fewer yards (-12%)",
  ]);
  const rb = decide(11, "RB", { defense: 0, weather: 0, injury: 0.12, defenseRank: null, defenseTeams: 32 }, rank("RB", 30), [
    "Teammate L. Back (RB) is out: the lead running back is out, so more carries and goal-line work come his way (+12%)",
  ]);
  assert.ok(rb.score > wr.score, "the RB with more opportunity edges the WR with a backup QB");
  assert.match(wr.reasons.join(" "), /backup QB/);
  assert.match(rb.reasons.join(" "), /more carries/);
});

test("close calls only pair players who can play the slot", () => {
  const lineup: any = [
    { slot: "QB", label: "QB", player: pl("qb", "QB1", "QB", 18), locked: false, changed: false },
    { slot: "RB", label: "RB", player: pl("rb", "RB1", "RB", 10), locked: false, changed: false },
    { slot: "FLEX", label: "FLEX", player: pl("wr", "WR1", "WR", 9), locked: false, changed: false },
  ];
  const bench: any = [pl("qb2", "QB2", "QB", 9.8), pl("rb2", "RB2", "RB", 9.5), pl("te", "TE2", "TE", 8.6)];
  const calls = findCloseCalls(lineup, bench);
  assert.ok(!calls.some(c => c.bench.position === "QB" && c.slot !== "QB"), "a QB is never a close call for RB/FLEX");
  assert.deepEqual(calls.map(c => `${c.slot}:${c.bench.name}`).sort(), ["FLEX:TE2", "RB:RB2"]);
});

test("a trade you build: send it, or edit it so they say yes", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"] as any;
  const me = {
    rosterId: 1, ownerId: "a", teamName: "Me",
    players: [pl("q", "My QB", "QB", 20), pl("r1", "My RB1", "RB", 15), pl("r2", "My RB2", "RB", 12), pl("r3", "My RB3", "RB", 11), pl("w1", "My WR1", "WR", 9), pl("w2", "My WR2", "WR", 7), pl("w3", "My WR3", "WR", 6.5), pl("t", "My TE", "TE", 8)],
  };
  const them = {
    rosterId: 2, ownerId: "b", teamName: "Them",
    players: [pl("q2", "Their QB", "QB", 19), pl("tr1", "Their RB1", "RB", 9), pl("tr2", "Their RB2", "RB", 6), pl("tw1", "Their WR1", "WR", 16), pl("tw2", "Their WR2", "WR", 13), pl("tw3", "Their WR3", "WR", 12), pl("tt", "Their TE", "TE", 7), pl("tw4", "Their WR4", "WR", 10)],
  };
  // My spare RB for their WR3: both lineups improve.
  const good = gradeProposal(me as any, them as any, [me.players[3]] as any, [them.players[5]] as any, slots);
  assert.equal(good.mode, "send");
  assert.equal(good.verdict, "send");
  assert.match(good.headline, /^Send it/);
  // A lowball: my WR3 for their WR1 helps me but costs them; edits must still help me and not hurt them.
  const lowball = gradeProposal(me as any, them as any, [me.players[6]] as any, [them.players[3]] as any, slots);
  assert.equal(lowball.verdict, "edit");
  assert.match(lowball.headline, /they'll likely say no/);
  for (const e of lowball.counters) {
    assert.ok(e.idea.myGain >= 0.3, e.summary);
    assert.ok(e.idea.theirGain >= -0.3, e.summary);
  }
});

test("Sleeper stats: both response forms parse to the same rows", () => {
  const newer = [{ player_id: "4046", stats: { pts_ppr: 210.5, gp: 9 }, player: { position: "QB" } }];
  const classic = { "4046": { pts_ppr: 210.5, gp: 9 } };
  assert.deepEqual(toStatRows(newer), [{ id: "4046", position: "QB", stats: { pts_ppr: 210.5, gp: 9 } }]);
  assert.deepEqual(toStatRows(classic), [{ id: "4046", position: "", stats: { pts_ppr: 210.5, gp: 9 } }]);
  assert.deepEqual(toStatRows(null), []);
});
