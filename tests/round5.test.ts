import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bigPlayNotifications, formatStamp, lineupCheckNotification, notificationsFromState, oddsSwingNotification, snapshotOf, TONE_LABELS,
} from "../app/services/notifications";
import { lineupCheckTimes, LINEUP_CHECK_LEAD_MS } from "../app/services/lineupCheck";
import { favoriteNews, favoriteReason } from "../app/services/favoritesFilter";
import { buildDropAlerts } from "../app/services/dropAlerts";
import { matchGuide, GUIDE, TUTORIAL_STEPS } from "../app/services/appGuide";
import { shouldAutoStart } from "../app/services/onboarding";
import { gradeCall, namesInQuestion, parseVerdict, summarizeRecord, type AiCall } from "../app/services/aiRecord";
import { askAboutOffer, GRADE_COLORS } from "../app/services/tradeGrader";

const base = { leagueId: "L", leagueName: "My League", week: 9, now: "2026-11-08T19:00:00Z" };

test("notifications carry a tone, league and an AI question", () => {
  const n = notificationsFromState({
    ...base,
    alerts: [
      { kind: "questionable", playerId: "1", slot: "WR", message: "Drake London (Hip) is questionable — check before kickoff." },
      { kind: "empty", playerId: null, slot: "FLEX", message: "Your FLEX slot is empty." },
    ],
    irLocks: [{ id: "5", name: "Hurt Guy", status: "QUESTIONABLE", drop: "Bench Guy" }],
    board: { week: 9, isFinal: true, me: { teamName: "Me", points: 90 }, opponent: { teamName: "You", points: 101 } },
  });
  assert.ok(n.every(x => x.tone && x.leagueName === "My League"));
  const q = n.find(x => x.id.includes(":1:questionable"))!;
  assert.equal(q.tone, "bad");
  assert.equal(q.aiQuestion, "Drake London is questionable this week. Who should I start instead?");
  assert.match(n.find(x => x.kind === "lineup" && x.body.includes("FLEX"))!.aiQuestion!, /FLEX spot is empty/);
  const lock = n.find(x => x.id.startsWith("irlock"))!;
  assert.match(lock.body, /Drop Bench Guy/);
  const final = n.find(x => x.kind === "result")!;
  assert.equal(final.tone, "bad");
  assert.equal(final.title, "Week 9 final: you lost");
  assert.equal(TONE_LABELS.good, "Good news");
});

test("big plays: your touchdowns are good news, the opponent's are bad", () => {
  const before = snapshotOf([{ id: "1", name: "A", points: 6, touchdowns: 0 }, { id: "2", name: "B", points: 3, touchdowns: 0 }]);
  const mine = [{ id: "1", name: "Ja'Marr Chase", points: 14.5, touchdowns: 1 }];
  const theirs = [{ id: "2", name: "CeeDee Lamb", points: 12, touchdowns: 1 }];
  const out = bigPlayNotifications(base, before, mine, theirs, "Team Two");
  assert.equal(out.length, 2);
  assert.equal(out[0].tone, "good");
  assert.equal(out[0].title, "Touchdown!");
  assert.match(out[0].body, /Ja'Marr Chase just scored a touchdown for you/);
  assert.equal(out[1].tone, "bad");
  assert.match(out[1].body, /Team Two's CeeDee Lamb/);
  // Nothing to compare on the first look; no repeat for the same touchdown.
  assert.deepEqual(bigPlayNotifications(base, null, mine, theirs), []);
  assert.deepEqual(bigPlayNotifications(base, snapshotOf(mine), mine, []), []);
  // A big jump without a touchdown also counts.
  const jump = bigPlayNotifications(base, before, [{ id: "1", name: "A", points: 15, touchdowns: 0 }], []);
  assert.equal(jump[0].title, "Big play");
});

test("odds swings only when you cross 50%", () => {
  assert.equal(oddsSwingNotification(base, 0.45, 0.48, "X"), null);
  assert.equal(oddsSwingNotification(base, null, 0.6, "X"), null);
  const up = oddsSwingNotification(base, 0.45, 0.62, "X")!;
  assert.equal(up.tone, "good");
  assert.match(up.body, /62%/);
  assert.equal(oddsSwingNotification(base, 0.6, 0.4, "X")!.tone, "bad");
});

test("lineup check reminders: 90 minutes before each future kickoff", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  const times = lineupCheckTimes(["2026-11-08T18:00:00Z", "2026-11-08T18:00:00Z", "2026-11-08T21:25:00Z", "2026-11-08T13:00:00Z"], now);
  assert.deepEqual(times.map(t => t.at.toISOString()), ["2026-11-08T16:30:00.000Z", "2026-11-08T19:55:00.000Z"]);
  assert.equal(LINEUP_CHECK_LEAD_MS, 90 * 60 * 1000);
  const n = lineupCheckNotification(base, 2, 6.4, "2026-11-08T18:00:00Z");
  assert.equal(n.openLineupCheck, true);
  assert.match(n.body, /2 swaps would add about 6.4 pts/);
  assert.equal(lineupCheckNotification(base, 0, 0, "k").tone, "good");
});

test("timestamps", () => {
  const now = new Date("2026-11-08T20:00:00");
  assert.match(formatStamp("2026-11-08T13:42:00", now), /^Sun 1:42 PM$/);
  assert.match(formatStamp("2026-10-20T13:42:00", now), /^Oct 20, 1:42 PM$/);
  assert.equal(formatStamp("nope"), "");
});

test("favorites news: followed players and teams, newest first, no repeats", () => {
  const players = { "1": { full_name: "Ja'Marr Chase", team: "CIN" }, "2": { full_name: "Joe Burrow", team: "CIN" }, "3": { full_name: "Josh Allen", team: "BUF" } };
  const news = [
    { title: "Chase scores twice", player: "Ja'Marr Chase", published: "2026-11-02", link: "a" },
    { title: "Burrow back at practice", player: "Joe Burrow", published: "2026-11-03", link: "b" },
    { title: "Allen MVP talk", player: "Josh Allen", published: "2026-11-04", link: "c" },
    { title: "Chase scores twice", player: "Ja'Marr Chase", published: "2026-11-02", link: "a" },
  ];
  const fav = { players: ["1"], teams: ["CIN"] };
  assert.deepEqual(favoriteNews(news, fav, players).map(a => a.link), ["b", "a"]);
  assert.equal(favoriteReason(news[0], fav, players), "Following");
  assert.equal(favoriteReason(news[1], { players: [], teams: ["CIN"] }, players), "CIN news");
  assert.deepEqual(favoriteNews(news, { players: [], teams: [] }, players), []);
});

test("drop alerts for your players in the top 25 drops", () => {
  const alerts = buildDropAlerts({
    drops: [{ player_id: "9", count: 100 }, { player_id: "1", count: 12400 }, { player_id: "2", count: 900 }],
    myPlayers: [
      { playerId: "1", fullName: "Starter Guy", position: "RB", isStarter: true },
      { playerId: "2", fullName: "Bench Guy", position: "WR", isStarter: false },
    ],
    topAdd: { name: "Hot Add", position: "WR" },
  });
  assert.deepEqual(alerts.map(a => [a.name, a.rank]), [["Starter Guy", 2], ["Bench Guy", 3]]);
  assert.match(alerts[0].advice, /don't panic-drop/);
  assert.match(alerts[1].advice, /Hot Add/);
  assert.match(alerts[1].question, /Should I drop him/);
  const ir = buildDropAlerts({
    drops: [{ player_id: "2", count: 900 }],
    myPlayers: [{ playerId: "2", fullName: "Hurt Guy", position: "RB", isStarter: false }],
    topAdd: { name: "Hurt Guy", position: "RB" },
    reserve: ["2"],
  });
  assert.match(ir[0].advice, /in your IR spot/);
  const self = buildDropAlerts({
    drops: [{ player_id: "2", count: 900 }],
    myPlayers: [{ playerId: "2", fullName: "Same Guy", position: "RB", isStarter: false }],
    topAdd: { name: "Same Guy", position: "RB" },
  });
  assert.doesNotMatch(self[0].advice, /like Same Guy/);
});

test("help guide matches questions to topics", () => {
  assert.equal(matchGuide("how do I add my league")[0].id, "add-league");
  assert.equal(matchGuide("what do the win odds mean")[0].id, "win-odds");
  assert.equal(matchGuide("how does IR work")[0].id, "ir");
  assert.equal(matchGuide("who should I start")[0].id, "start-sit");
  assert.equal(matchGuide("asdfgh").length, 0);
  assert.ok(GUIDE.every(g => g.answer.length > 40));
  assert.ok(TUTORIAL_STEPS.length >= 6);
});

test("tutorial starts automatically only for new users", () => {
  assert.equal(shouldAutoStart(false, true, 0), true);
  assert.equal(shouldAutoStart(true, true, 0), false);
  assert.equal(shouldAutoStart(false, true, 2), false);
  assert.equal(shouldAutoStart(false, false, 0), false);
});

test("AI record: parse the verdict, grade it, summarize", () => {
  const names = namesInQuestion("Should I start Garrett Wilson or Tee Higgins this week?");
  assert.deepEqual(names, ["Garrett Wilson", "Tee Higgins"]);
  const v = parseVerdict("──\n▶ VERDICT: START TEE HIGGINS over GARRETT WILSON — Confidence 7/10\n• reason", names);
  assert.deepEqual(v, { pick: "Tee Higgins", other: "Garrett Wilson" });
  assert.deepEqual(parseVerdict("▶ VERDICT: START **Tee Higgins** over Garrett Wilson\n", names), { pick: "Tee Higgins", other: "Garrett Wilson" });
  assert.equal(parseVerdict("No verdict here", names), null);
  const call: AiCall = { id: "1", leagueId: "L", season: 2026, week: 8, askedAt: "", pick: "Tee Higgins", other: "Garrett Wilson" };
  assert.equal(gradeCall(call, { teehiggins: 17, garrettwilson: 9 }).result, "right");
  assert.equal(gradeCall(call, { teehiggins: 4, garrettwilson: 9 }).result, "wrong");
  assert.equal(gradeCall(call, { teehiggins: null, garrettwilson: 9 }).result, undefined);
  const s = summarizeRecord([{ ...call, result: "right" }, { ...call, result: "right" }, { ...call, result: "wrong" }, call]);
  assert.deepEqual(s, { right: 2, wrong: 1, push: 0, pending: 1, pct: 67 });
});

test("trade grader helpers", () => {
  assert.equal(GRADE_COLORS.A, "success");
  assert.equal(GRADE_COLORS.F, "danger");
  assert.equal(askAboutOffer("Team Two", ["A"], ["B", "C"]), "Team Two offered me B and C for A. Should I accept this trade?");
});
