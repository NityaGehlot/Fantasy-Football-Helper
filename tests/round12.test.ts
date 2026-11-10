import { test } from "node:test";
import assert from "node:assert/strict";
import { sleeperLeagueUrl } from "../app/services/externalLinks";
import { isVideoArticle } from "../app/services/newsDiversity";

test("link out to Sleeper", () => {
  assert.equal(sleeperLeagueUrl("1402843174556143616"), "https://sleeper.com/leagues/1402843174556143616");
});

test("video articles", () => {
  assert.equal(isVideoArticle({ video: true }), true);
  assert.equal(isVideoArticle({ link: "https://www.youtube.com/watch?v=abc" }), true);
  assert.equal(isVideoArticle({ url: "https://www.nfl.com/videos/allgeier-td" }), true);
  assert.equal(isVideoArticle({ url: "https://www.espn.com/nfl/story/_/id/1" }), false);
});
