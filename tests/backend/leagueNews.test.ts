import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLeagueHeadline, parseEspnNews, rankLeagueNews } from "../../app/backend/services/leagueNews";

test("league headlines are tagged by story type", () => {
  assert.equal(classifyLeagueHeadline("Bears trade for Titans DT Jeffery Simmons").category, "trade");
  assert.equal(classifyLeagueHeadline("Packers place Romeo Doubs on injured reserve").category, "injury");
  assert.equal(classifyLeagueHeadline("Packers place Romeo Doubs on injured reserve").importance, 5);
  assert.equal(classifyLeagueHeadline("Christian McCaffrey returns to practice").category, "return");
  assert.equal(classifyLeagueHeadline("Jets release veteran RB").category, "release");
  assert.equal(classifyLeagueHeadline("Chiefs sign WR to practice squad").category, "signing");
  assert.equal(classifyLeagueHeadline("Rashee Rice suspended six games").category, "suspension");
  assert.equal(classifyLeagueHeadline("Week 9 power rankings").category, "other");
});

test("ESPN feed parsing keeps images, links, players and drops videos", () => {
  const parsed = parseEspnNews({
    articles: [
      {
        id: 1, type: "HeadlineNews", headline: "Bills acquire WR in trade", description: "Buffalo adds a deep threat.",
        published: "2026-10-31T18:00:00Z", images: [{ type: "header", url: "https://img/1.jpg" }],
        links: { web: { href: "https://espn.com/1" } },
        categories: [{ type: "athlete", description: "Some Receiver" }, { type: "team", description: "Buffalo Bills" }],
      },
      { id: 2, type: "Media", headline: "Video: highlights" },
      { id: 3, type: "Story", headline: "Week 9 picks", published: "2026-11-01T10:00:00Z" },
    ],
  });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].image, "https://img/1.jpg");
  assert.equal(parsed[0].link, "https://espn.com/1");
  assert.deepEqual(parsed[0].players, ["Some Receiver"]);
  assert.equal(parsed[1].image, null);
  // Trade outranks a newer general story
  assert.equal(rankLeagueNews(parsed)[0].category, "trade");
});

test("the headline decides the tag, and 'trade deadline' isn't a trade", () => {
  assert.equal(classifyLeagueHeadline("Chiefs sign veteran WR to one-year deal", "Kansas City adds depth ahead of the trade deadline.").category, "signing");
  assert.equal(classifyLeagueHeadline("Five storylines before the trade deadline").category, "other");
  assert.equal(classifyLeagueHeadline("Big move in Chicago", "The Bears traded two first-round picks.").category, "trade");
});
