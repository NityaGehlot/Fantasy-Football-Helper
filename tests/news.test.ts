import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDiverseNews, titleSimilarity } from "../app/services/newsDiversity";

const a = (title: string, link: string, published: string, category: string, player = "Ja'Marr Chase") =>
  ({ title, link, published, category, player });

const arts = [
  a("Ja'Marr Chase ruled out vs. Steelers with hamstring injury", "a", "2026-10-31", "injury"),
  a("Ja'Marr Chase ruled out vs. Steelers due to hamstring", "b", "2026-10-31", "injury"),
  a("Bengals discuss Ja'Marr Chase contract extension", "c", "2026-10-30", "transaction"),
  a("Week 9 rankings: where Ja'Marr Chase lands", "d", "2026-10-29", "fantasy_advice"),
  a("Ja'Marr Chase hamstring injury update from practice", "e", "2026-10-28", "injury"),
];

test("player news: newest first, no near-duplicates, varied categories", () => {
  assert.deepEqual(selectDiverseNews(arts, 3).map(x => x.link), ["a", "c", "d"]);
  assert.ok(titleSimilarity(arts[0], arts[1]) >= 0.45);
  assert.ok(titleSimilarity(arts[0], arts[4]) < 0.45);
  // When only injury stories exist, still fill the slots (without the duplicate)
  assert.deepEqual(selectDiverseNews([arts[0], arts[1], arts[4]], 3).map(x => x.link), ["a", "e"]);
});

test("team news: one article per teammate", () => {
  const team = [
    a("Tee Higgins catches two TDs", "t1", "2026-10-31", "performance", "Tee Higgins"),
    a("Tee Higgins listed questionable", "t2", "2026-10-30", "injury", "Tee Higgins"),
    a("Chase Brown expected to play", "t3", "2026-10-29", "injury_return", "Chase Brown"),
    a("Joe Burrow back at practice", "t4", "2026-10-28", "injury_return", "Joe Burrow"),
  ];
  assert.deepEqual(selectDiverseNews(team, 3, { onePerPlayer: true }).map(x => x.link), ["t1", "t3", "t4"]);
});

import { leagueNewsFromPlayerNews, timeAgo } from "../app/services/leagueNews";

test("league news fallback keeps important player stories, one per player", () => {
  const feed = leagueNewsFromPlayerNews([
    { title: "Romeo Doubs placed on IR", player: "Romeo Doubs", category: "injury", impact: "negative", published: "2026-10-31", link: "1" },
    { title: "Romeo Doubs hamstring update", player: "Romeo Doubs", category: "injury", impact: "slightly_negative", published: "2026-10-30", link: "2" },
    { title: "Bears trade for receiver", player: "Some WR", category: "transaction", impact: "roster_move", published: "2026-10-29", link: "3" },
    { title: "Week 9 rankings", player: "X", category: "fantasy_advice", impact: "neutral", published: "2026-11-01", link: "4" },
    { title: "Joe Burrow returns to practice", player: "Joe Burrow", category: "injury_return", impact: "positive", published: "2026-10-28", link: "5" },
  ]);
  assert.deepEqual(feed.map(a => a.id), ["1", "3", "5"]);
  assert.deepEqual(feed.map(a => a.category), ["injury", "trade", "return"]);
});

test("time ago labels", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  assert.equal(timeAgo("2026-11-01T11:30:00Z", now), "30m ago");
  assert.equal(timeAgo("2026-11-01T07:00:00Z", now), "5h ago");
  assert.equal(timeAgo("2026-10-31T10:00:00Z", now), "Yesterday");
  assert.equal(timeAgo("not a date", now), "");
});
