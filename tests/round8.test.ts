import { test } from "node:test";
import assert from "node:assert/strict";
import { isInjuryHeadline, latestInjuryNews } from "../app/services/injuryNews";
import { injuryForWeek, practiceCode } from "../app/services/injuryFormat";
import { leagueMoveNotification, notificationsFromState } from "../app/services/notifications";
import { recentMovesByOthers } from "../app/services/leagueMoves";
import { ordinal } from "../app/services/playerRanks";

test("injury card only uses headlines about HIS injury", () => {
  const p = "Tyler Allgeier";
  assert.equal(isInjuryHeadline({ player: p, category: "general", title: "Tyler Allgeier answered the call for a career day when injuries mounted for the Arizona Cardinals" }), false);
  assert.equal(isInjuryHeadline({ player: p, category: "fantasy", title: "Fantasy Football Injury Report: Jeremiah Love Placed on IR, Tyler Allgeier Becomes RB1" }), false);
  assert.equal(isInjuryHeadline({ player: "Bhayshul Tuten", title: "Bhayshul Tuten not spotted at Jaguars practice Wednesday" }), true);
  assert.equal(isInjuryHeadline({ player: "Bhayshul Tuten", title: "Jaguars' Bhayshul Tuten (ankle) ruled out vs. Texans" }), true);
  assert.equal(isInjuryHeadline({ player: "Puka Nacua", title: "Puka Nacua suffers ankle sprain in loss" }), true);
  // Filed as injury news but not naming him: trust the filing.
  assert.equal(isInjuryHeadline({ player: "Bhayshul Tuten", category: "injury", title: "Jaguars RB status for Sunday" }), true);

  const now = Date.parse("2026-11-04T12:00:00Z");
  const items: any[] = [
    { player: p, title: "Tyler Allgeier answered the call for a career day when injuries mounted", published: "2026-11-03", category: "general" },
  ];
  assert.equal(latestInjuryNews(items, p, now), null);
});

test("injury report follows the selected week", () => {
  const file: any = {
    generated_at: "2026-11-04",
    season: 2026,
    week: 9,
    players: [{ player_id: "12490", full_name: "Bhayshul Tuten", team: "JAX", position: "RB", status: "QUESTIONABLE", injury: "Ankle", history: [{ date: "2026-11-04", day: "Wed", practice_status: "DNP" }] }],
  };
  const player = { player_id: "12490", full_name: "Bhayshul Tuten", team: "JAX" };

  const current = injuryForWeek({ file, player, season: 2026, week: 9 });
  assert.equal(current.mode, "current");
  assert.equal(current.status, "QUESTIONABLE");

  // Week 8 from the saved day-by-day history.
  const history = { "12490": [{ date: "2026-10-23", day: "Thu", practice_status: "LP" }, { date: "2026-10-24", day: "Fri", practice_status: "FP", game_status: "QUESTIONABLE" }] };
  const w8 = injuryForWeek({ file, history, player, season: 2026, week: 8 });
  assert.equal(w8.mode, "past");
  assert.equal(w8.status, "QUESTIONABLE");
  assert.deepEqual(w8.rows.map(r => r.practiceLabel), ["Limited", "Full"]);

  // Week 3: no saved history, use that week's final report from the stat line.
  const w3 = injuryForWeek({ file, player, season: 2026, week: 3, weekStats: { injury_status: "Out", practice_status: "Did Not Participate In Practice", primary_injury: "Hamstring" } });
  assert.equal(w3.status, "OUT");
  assert.equal(w3.injury, "Hamstring");
  assert.equal(w3.rows[0].practice, "DNP");

  // A healthy week in the past: no designation, and not the current week's status.
  const w2 = injuryForWeek({ file, player, season: 2026, week: 2, weekStats: { fantasy_points_ppr: 12 } });
  assert.equal(w2.status, "");
  assert.equal(w2.mode, "past");

  // A past season never shows this week's report.
  assert.equal(injuryForWeek({ file, player, season: 2025, week: 12 }).mode, "past");
  assert.equal(practiceCode("Limited Participation in Practice"), "LP");
});

test("open roster spot and league move notifications", () => {
  const out = notificationsFromState({
    leagueId: "L",
    leagueName: "Goongent",
    week: 9,
    openSpots: { open: 1, used: 14, needs: ["TE"], top: "Free TE" },
    now: "2026-11-04T12:00:00Z",
  });
  const n = out.find(x => x.kind === "roster")!;
  assert.equal(n.title, "1 open roster spot");
  assert.match(n.body, /short at TE.*Top pickup: Free TE/);
  assert.match(n.aiQuestion!, /Who should I pick up\?/);

  const move = leagueMoveNotification({ leagueId: "L", leagueName: "Goongent" }, { id: "t1", type: "trade", summary: "Trade: A gets X; B gets Y", at: 1 });
  assert.equal(move.id, "move:L:t1");
  assert.match(move.aiQuestion!, /Who won this trade/);

  const now = Date.parse("2026-11-04T12:00:00Z");
  const moves: any[] = [
    { id: "1", involvesYou: false, at: now - 3_600_000 },
    { id: "2", involvesYou: true, at: now - 3_600_000 },
    { id: "3", involvesYou: false, at: now - 3 * 86_400_000 },
  ];
  assert.deepEqual(recentMovesByOthers(moves, now).map(m => m.id), ["1"]);
});

test("ordinals", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
});

test("a past season without a week never shows this week's injury report", () => {
  const file: any = { generated_at: "", season: 2026, week: 9, players: [{ player_id: "1", full_name: "A B", team: "X", position: "RB", status: "OUT" }] };
  const r = injuryForWeek({ file, player: { player_id: "1" }, season: 2025 });
  assert.equal(r.mode, "past");
  assert.equal(r.status, "");
  assert.equal(injuryForWeek({ file, player: { player_id: "1" }, season: 2026 }).status, "OUT");
});
