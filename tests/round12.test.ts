import { test } from "node:test";
import assert from "node:assert/strict";
import { sleeperLeagueUrl, teamSearchName, xSearchUrl } from "../app/services/externalLinks";
import { isVideoArticle } from "../app/services/newsDiversity";

test("links out to Sleeper and X", () => {
  assert.equal(sleeperLeagueUrl("1402843174556143616"), "https://sleeper.com/leagues/1402843174556143616");
  assert.equal(xSearchUrl("Tyler Allgeier"), "https://x.com/search?q=%22Tyler%20Allgeier%22&f=live");
  assert.equal(teamSearchName("ari", "Tyler Allgeier"), "Arizona Cardinals");
  assert.equal(teamSearchName("FA", "Tyler Allgeier"), "Tyler Allgeier");
});

test("video articles", () => {
  assert.equal(isVideoArticle({ video: true }), true);
  assert.equal(isVideoArticle({ link: "https://www.youtube.com/watch?v=abc" }), true);
  assert.equal(isVideoArticle({ url: "https://www.nfl.com/videos/allgeier-td" }), true);
  assert.equal(isVideoArticle({ url: "https://www.espn.com/nfl/story/_/id/1" }), false);
});
