import { test } from "node:test";
import assert from "node:assert/strict";
import {
  injuryImpacts, missChance, netImpact, positionGroup, selfInjuryNote, formatImpactBlock, type InjuredPlayer,
} from "../../app/backend/services/injuryImpact";
import { weatherEffect, weatherForPosition, type GameWeather } from "../../app/backend/services/weather";
import { computeDefenseRankings, formatDefenseBlock, tierFor } from "../../app/backend/services/defenseRankings";
import { matchupAdjustment, formatMatchupBlock, injuredOnTeam, type MatchupContext } from "../../app/backend/services/matchupContext";
import { buildIrAdvice, irEligibleStatuses } from "../../app/backend/services/irAdvice";
import { parseScoreboardEvent } from "../../app/backend/services/schedule";
import { oddsPercents } from "../../app/backend/services/liveMatchup";
import {
  extractShareImage, extractDecodingParams, buildBatchRequest, parseBatchResponse, isGoogleNewsLink, googleArticleId, headshotFor,
} from "../../app/backend/services/articleImages";

const out = (name: string, position: string, status = "OUT", injury = "Knee"): InjuredPlayer => ({ name, position, status, injury, depthOrder: 1 });
const weightFrom = (position: string, teammates: InjuredPlayer[] = [], opponents: InjuredPlayer[] = []) =>
  injuryImpacts({ playerName: "Test Player", position, teammates, opponents }).reduce((t, n) => t + n.weight, 0);

// ---------- Injuries: every position against every kind of injured teammate ----------

test("position groups cover offense, line and defense spots", () => {
  assert.equal(positionGroup("LT"), "OL");
  assert.equal(positionGroup("C"), "OL");
  assert.equal(positionGroup("EDGE"), "DL");
  assert.equal(positionGroup("OLB"), "LB");
  assert.equal(positionGroup("FS"), "DB");
  assert.equal(positionGroup("CB"), "DB");
  assert.equal(positionGroup("FB"), "RB");
  assert.equal(positionGroup("PK"), "K");
  assert.equal(positionGroup("LS"), "OTHER");
});

test("miss chance by designation", () => {
  for (const s of ["OUT", "IR", "PUP", "SUS", "NA", "DOUBTFUL"]) assert.equal(missChance(s), 1, s);
  assert.equal(missChance("QUESTIONABLE"), 0.5);
  assert.equal(missChance("ACTIVE"), 0);
  assert.equal(missChance(""), 0);
});

// Expected direction for [player position][injured teammate position]: +1 up, -1 down, 0 no rule.
const TEAMMATE_EXPECT: Record<string, Record<string, number>> = {
  QB: { QB: 0, RB: -1, WR: -1, TE: -1, OL: -1, DL: 0, LB: 0, DB: 0, K: 0 },
  RB: { QB: -1, RB: 1, WR: 1, TE: 1, OL: -1, DL: 0, LB: 0, DB: 0, K: 0 },
  WR: { QB: -1, RB: 0, WR: 1, TE: 1, OL: -1, DL: 0, LB: 0, DB: 0, K: 0 },
  TE: { QB: -1, RB: 0, WR: 1, TE: 1, OL: -1, DL: 0, LB: 0, DB: 0, K: 0 },
  K: { QB: -1, RB: 0, WR: 0, TE: 0, OL: -1, DL: 0, LB: 0, DB: 0, K: 0 },
  DEF: { QB: 0, RB: 0, WR: 0, TE: 0, OL: 0, DL: -1, LB: -1, DB: -1, K: 0 },
};
const POS_FOR_GROUP: Record<string, string> = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", OL: "LT", DL: "DE", LB: "ILB", DB: "CB", K: "K" };

for (const [player, row] of Object.entries(TEAMMATE_EXPECT)) {
  test(`${player}: every injured-teammate position moves him the right way`, () => {
    for (const [group, dir] of Object.entries(row)) {
      const w = weightFrom(player, [out("Teammate", POS_FOR_GROUP[group])]);
      assert.equal(Math.sign(w), dir, `${player} with injured ${group} → ${w}`);
    }
  });
}

const OPPONENT_EXPECT: Record<string, Record<string, number>> = {
  QB: { DB: 1, DL: 1, LB: 1, QB: 0, WR: 0, OL: 0 },
  RB: { DL: 1, LB: 1, DB: 1, QB: 0, OL: 0 },
  WR: { DB: 1, DL: 1, LB: 0, QB: 0 },
  TE: { LB: 1, DB: 1, DL: 0 },
  K: { DB: 0, DL: 0, QB: 0 },
  DEF: { QB: 1, OL: 1, WR: 1, RB: 1, DB: 0 },
};
for (const [player, row] of Object.entries(OPPONENT_EXPECT)) {
  test(`${player}: injured opponents move him the right way`, () => {
    for (const [group, dir] of Object.entries(row)) {
      const w = weightFrom(player, [], [out("Opponent", POS_FOR_GROUP[group])]);
      assert.equal(Math.sign(w), dir, `${player} vs injured ${group} → ${w}`);
    }
  });
}

test("questionable teammates count half, backups and healthy players don't count", () => {
  assert.equal(weightFrom("WR", [out("QB1", "QB", "OUT")]), -2);
  assert.equal(weightFrom("WR", [out("QB1", "QB", "QUESTIONABLE")]), -1);
  assert.equal(weightFrom("WR", [{ ...out("QB2", "QB"), depthOrder: 2 }]), 0);
  assert.equal(weightFrom("WR", [out("QB1", "QB", "ACTIVE")]), 0);
});

test("the player himself isn't counted as his own injured teammate", () => {
  const notes = injuryImpacts({ playerName: "Ja'Marr Chase", position: "WR", teammates: [out("Ja'Marr Chase", "WR")] });
  assert.equal(notes.length, 0);
});

test("own injury: each body-part type is scored", () => {
  const cases: [string, string, number][] = [
    ["QUESTIONABLE", "Hamstring", -1.5],
    ["QUESTIONABLE", "Concussion", -1.5],
    ["QUESTIONABLE", "Knee", -1.5],
    ["QUESTIONABLE", "Ankle", -1],
    ["QUESTIONABLE", "Shoulder", -0.5],
    ["QUESTIONABLE", "Back", -0.5],
    ["QUESTIONABLE", "Illness", 0],
    ["QUESTIONABLE", "Unknown thing", -1],
    ["DOUBTFUL", "Ankle", -2.5],
    ["OUT", "Knee", -3],
    ["IR", "Achilles", -3],
  ];
  for (const [status, injury, weight] of cases) {
    assert.equal(selfInjuryNote("WR", status, injury)?.weight, weight, `${status} ${injury}`);
  }
  assert.equal(selfInjuryNote("WR", "ACTIVE", ""), null);
});

test("net effect is capped and labeled", () => {
  const many = [out("A", "LT"), out("B", "RT"), out("C", "LG"), out("D", "QB"), out("E", "C")];
  const notes = injuryImpacts({ playerName: "RB One", position: "RB", teammates: many });
  const net = netImpact(notes);
  assert.equal(net.score, -3);
  assert.equal(net.label, "big downgrade");
  assert.match(formatImpactBlock(notes), /Net injury effect: -3 \(big downgrade\)/);
  assert.match(formatImpactBlock([]), /No injuries/);
});

// ---------- Weather ----------

const wx = (over: Partial<GameWeather>): GameWeather => ({
  indoors: false, tempF: 55, windMph: 5, precipChance: 0, precipInches: 0, snowInches: 0, summary: "", ...over,
});

test("weather: domes and calm days have no effect", () => {
  assert.deepEqual(weatherEffect(wx({ indoors: true, windMph: 30 })), { passing: 0, rushing: 0, kicking: 0, notes: [] });
  assert.equal(weatherEffect(wx({})).passing, 0);
  assert.equal(weatherEffect(null).passing, 0);
});

test("weather: wind, rain, snow and cold", () => {
  const windy = weatherEffect(wx({ windMph: 22 }));
  assert.equal(windy.passing, -2);
  assert.equal(windy.kicking, -2);
  assert.equal(windy.rushing, 1);
  assert.equal(weatherEffect(wx({ windMph: 16 })).passing, -1);
  assert.equal(weatherEffect(wx({ precipChance: 80, precipInches: 0.3 })).passing, -1);
  assert.equal(weatherEffect(wx({ precipChance: 20, precipInches: 0.3 })).passing, 0); // unlikely rain
  assert.equal(weatherEffect(wx({ precipChance: 90, snowInches: 1 })).rushing, 0.5);
  assert.equal(weatherEffect(wx({ tempF: 12 })).passing, -0.5);
  const e = weatherEffect(wx({ windMph: 22 }));
  assert.equal(weatherForPosition("WR", e), -2);
  assert.equal(weatherForPosition("RB", e), 1);
  assert.equal(weatherForPosition("K", e), -2);
  assert.equal(weatherForPosition("DEF", e), 1);
});

// ---------- Defense rankings ----------

const offenseRows = [
  { week: 1, team: "KC", opponent_team: "BUF", position: "QB", passing_yards: 300, passing_tds: 3, rushing_yards: 10, fantasy_points_ppr: 25 },
  { week: 1, team: "KC", opponent_team: "BUF", position: "RB", rushing_yards: 100, rushing_tds: 1, fantasy_points_ppr: 18 },
  { week: 1, team: "KC", opponent_team: "BUF", position: "WR", fantasy_points_ppr: 26 },
  { week: 2, team: "KC", opponent_team: "MIA", position: "QB", passing_yards: 200, passing_tds: 1, fantasy_points_ppr: 12 },
  { week: 2, team: "KC", opponent_team: "MIA", position: "WR", fantasy_points_ppr: 15 },
  { week: 1, team: "BUF", opponent_team: "KC", position: "QB", passing_yards: 150, passing_tds: 1, rushing_yards: 20, fantasy_points_ppr: 9 },
  { week: 1, team: "BUF", opponent_team: "KC", position: "WR", fantasy_points_ppr: 12 },
];

test("defense rankings match the R script's numbers", () => {
  const r = computeDefenseRankings(offenseRows, 2026);
  assert.equal(r.through_week, 2);
  assert.equal(r.teams.BUF.pass_yds_allowed, 300);
  assert.equal(r.teams.BUF.rush_yds_allowed, 110);
  assert.equal(r.teams.BUF.fantasy_points_allowed.WR, 26);
  assert.equal(r.teams.KC.ranks.pass, 1);
  assert.equal(r.teams.BUF.ranks.pass, 3);
  assert.equal(tierFor(1), "tough");
  assert.equal(tierFor(16), "average");
  assert.equal(tierFor(32), "easy");
  const block = formatDefenseBlock("BUF", "WR", r);
  assert.match(block, /fantasy points allowed to WRs: 26 per game/);
  assert.match(block, /rank 1 = allows the least/);
  assert.match(formatDefenseBlock("XYZ", "WR", r), /not available/);
});

// ---------- Matchup adjustment ----------

const ctx = (over: Partial<MatchupContext>): MatchupContext => ({
  team: "KC", opponent: "BUF", homeAway: "home", kickoff: null,
  defense: computeDefenseRankings(offenseRows, 2026), weather: null, weatherScore: 0, weatherNotes: [],
  injuries: [], injuryScore: 0, ...over,
});

test("matchup adjustment: easy defense up, tough defense down, capped", () => {
  const easy = matchupAdjustment("WR", ctx({ opponent: "BUF" })); // most WR points allowed
  const tough = matchupAdjustment("WR", ctx({ opponent: "KC" }));
  assert.ok(easy.multiplier > 1, String(easy.multiplier));
  assert.ok(tough.multiplier < 1, String(tough.multiplier));
  const awful = matchupAdjustment("WR", ctx({
    opponent: "KC", weatherScore: -2, weatherNotes: ["wind"],
    injuries: injuryImpacts({ playerName: "x", position: "WR", ownStatus: "QUESTIONABLE", ownInjury: "Hamstring", teammates: [out("QB1", "QB"), out("LT", "LT")] }),
  }));
  assert.equal(awful.multiplier, 0.7);
  assert.equal(matchupAdjustment("WR", null).multiplier, 1);
});

test("matchup block for the prompt explains ranks, weather and injuries", () => {
  const text = formatMatchupBlock("WR", ctx({
    weather: wx({ windMph: 22, summary: "40°F, wind 22 mph" }), weatherScore: -2, weatherNotes: ["wind around 22 mph"],
    injuries: injuryImpacts({ playerName: "x", position: "WR", teammates: [out("Other WR", "WR")] }),
  }), 9);
  assert.match(text, /WEEK 9 MATCHUP: KC vs BUF/);
  assert.match(text, /vs the pass/);
  assert.match(text, /hurts his outlook \(-2\)/);
  assert.match(text, /Teammate Other WR \(WR\): OUT/);
  assert.match(formatMatchupBlock("WR", ctx({ weather: { ...wx({}), indoors: true } }), 9), /indoors/);
});

test("injured players are read from Sleeper's database with depth order", () => {
  const players = {
    "1": { full_name: "Starter LT", team: "KC", position: "OT", injury_status: "Out", injury_body_part: "Ankle", depth_chart_order: 1 },
    "2": { full_name: "Healthy", team: "KC", position: "WR", injury_status: null },
    "3": { full_name: "Other Team", team: "BUF", position: "WR", injury_status: "Out" },
  };
  const list = injuredOnTeam(players, "KC");
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "OUT");
  assert.equal(list[0].depthOrder, 1);
});

// ---------- Schedule venue ----------

test("scoreboard events carry venue details for weather", () => {
  const [home] = parseScoreboardEvent({
    date: "2026-11-08T18:00Z",
    competitions: [{
      venue: { indoor: false }, neutralSite: false,
      status: { type: { state: "pre", shortDetail: "Sun 1:00 PM" }, period: 0, displayClock: "0:00" },
      competitors: [
        { homeAway: "home", team: { abbreviation: "BUF" }, score: "0" },
        { homeAway: "away", team: { abbreviation: "KC" }, score: "0" },
      ],
    }],
  });
  assert.equal(home.homeTeam, "BUF");
  assert.equal(home.indoor, false);
  assert.equal(home.neutralSite, false);
});

// ---------- IR advice ----------

test("IR eligibility follows league settings", () => {
  assert.deepEqual(irEligibleStatuses({}), ["IR", "INJURED RESERVE", "PUP"]);
  assert.ok(irEligibleStatuses({ reserve_allow_dnr: 1 }).includes("DNR"));
  assert.ok(irEligibleStatuses({ reserve_allow_na: 1 }).includes("NA"));
  assert.ok(irEligibleStatuses({ reserve_allow_out: 1 }).includes("OUT"));
  assert.ok(irEligibleStatuses({ reserve_allow_doubtful: 1 }).includes("DOUBTFUL"));
});

test("IR advice: move IR players into open spots and suggest a pickup", () => {
  const p = (id: string, position: string, value: number, injuryStatus = "ACTIVE") => ({ id, name: `P${id}`, position, team: "KC", injuryStatus, value });
  const myPlayers = [p("1", "QB", 20), p("2", "RB", 15), p("3", "RB", 12, "IR"), p("4", "WR", 14), p("5", "WR", 13), p("6", "TE", 8), p("7", "RB", 3, "IR")];
  const advice = buildIrAdvice({
    settings: { reserve_slots: 2 },
    roster: { players: myPlayers.map(x => x.id), reserve: ["7"] },
    myPlayers,
    freeAgents: [p("10", "RB", 11), p("11", "WR", 4), p("12", "TE", 9, "IR")],
    slots: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"],
  });
  assert.equal(advice.irSlots, 2);
  assert.equal(advice.irSlotsUsed, 1);
  assert.deepEqual(advice.onIr.map(x => x.id), ["7"]);
  assert.deepEqual(advice.shouldMove.map(x => x.id), ["3"]);
  assert.equal(advice.pickups[0].add.id, "10"); // fills the empty RB spot
  assert.ok(advice.pickups[0].netGain > 0);
  assert.ok(!advice.pickups.some(x => x.add.id === "12")); // injured free agents aren't suggested

  const full = buildIrAdvice({ settings: { reserve_slots: 1 }, roster: { reserve: ["7"] }, myPlayers, freeAgents: [], slots: ["QB"] });
  assert.equal(full.pickups.length, 0);
  assert.equal(full.shouldMove.length, 1);
});

// ---------- Win odds ----------

test("win odds percentages always add up to 100", () => {
  for (const p of [0, 0.004, 0.495, 0.5, 0.505, 0.6449, 0.995, 1]) {
    const [a, b] = oddsPercents(p);
    assert.equal(a + b, 100, String(p));
  }
  assert.deepEqual(oddsPercents(0.505), [51, 49]);
});

// ---------- Article images ----------

test("article share images are read from meta tags", () => {
  const html = `<head><meta property="og:image" content="https://cdn.site.com/a.jpg?w=1&amp;h=2"></head>`;
  assert.equal(extractShareImage(html, "https://site.com/x"), "https://cdn.site.com/a.jpg?w=1&h=2");
  assert.equal(extractShareImage(`<meta content="/img/b.png" name="twitter:image">`, "https://site.com/news/1"), "https://site.com/img/b.png");
  assert.equal(extractShareImage(`<meta property="og:image" content="http://x.com/c.jpg">`, "https://x.com"), "https://x.com/c.jpg");
  assert.equal(extractShareImage("<p>none</p>", "https://x.com"), null);
});

test("Google News links are decoded through Google's lookup", () => {
  const link = "https://news.google.com/rss/articles/CBMiABC123?oc=5";
  assert.ok(isGoogleNewsLink(link));
  assert.ok(!isGoogleNewsLink("https://www.espn.com/nfl/story"));
  assert.equal(googleArticleId(link), "CBMiABC123");
  assert.deepEqual(extractDecodingParams(`<c-wiz><div data-n-a-sg="SIG" data-n-a-ts="1730000000"></div>`), { signature: "SIG", timestamp: "1730000000" });
  const body = decodeURIComponent(buildBatchRequest("ID", "123", "SIG").replace(/^f\.req=/, ""));
  assert.match(body, /"Fbv4je"/);
  assert.match(body, /\\"ID\\",123,\\"SIG\\"/);
  const response = `)]}'\n\n${JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", "https://www.nbcsports.com/story"])]])}`;
  assert.equal(parseBatchResponse(response), "https://www.nbcsports.com/story");
  assert.equal(parseBatchResponse("garbage"), null);
  assert.equal(headshotFor({ espn_id: 42 }), "https://a.espncdn.com/i/headshots/nfl/players/full/42.png");
  assert.equal(headshotFor(null), null);
});

test("IR: a healthy player left in an IR spot locks the roster, with a drop to fix it", () => {
  const p = (id: string, position: string, value: number, injuryStatus = "ACTIVE") => ({ id, name: `P${id}`, position, team: "KC", injuryStatus, value });
  const myPlayers = [p("1", "QB", 20), p("2", "RB", 15), p("3", "WR", 14), p("4", "WR", 2), p("5", "RB", 12, "QUESTIONABLE")];
  const advice = buildIrAdvice({
    settings: { reserve_slots: 1, reserve_allow_out: 1 },
    roster: { reserve: ["5"] },
    myPlayers,
    freeAgents: [p("10", "RB", 11)],
    slots: ["QB", "RB", "RB", "WR", "WR"],
  });
  assert.equal(advice.locked.length, 1);
  assert.equal(advice.locked[0].player.id, "5");
  assert.equal(advice.locked[0].drop?.id, "4"); // the 2 pts/g WR is the smallest loss
  assert.equal(advice.pickups.length, 0); // no adds while locked
});

test("IR: long-term injuries go first and each move gets the right note", () => {
  const p = (id: string, injuryStatus: string) => ({ id, name: `P${id}`, position: "RB", team: "KC", injuryStatus, value: 10 });
  const advice = buildIrAdvice({
    settings: { reserve_slots: 3, reserve_allow_out: 1, reserve_allow_doubtful: 1 },
    roster: { reserve: [] },
    myPlayers: [p("1", "OUT"), p("2", "DOUBTFUL"), p("3", "IR")],
    freeAgents: [],
    slots: ["RB"],
  });
  assert.deepEqual(advice.shouldMove.map(x => x.id), ["3", "1", "2"]);
  assert.match(advice.shouldMove[0].note!, /long-term/);
  assert.match(advice.shouldMove[1].note!, /week-to-week/);
  assert.match(advice.shouldMove[2].note!, /sometimes play/);
});
