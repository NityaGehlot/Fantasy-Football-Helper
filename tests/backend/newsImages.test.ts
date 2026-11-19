import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKey, fromLinkCache } from "../../app/backend/services/articleImages";

test("link cache keys match nfl-data's (Google article id, else the link)", () => {
  assert.equal(cacheKey("https://news.google.com/rss/articles/CBMiABC?oc=5"), "CBMiABC");
  assert.equal(cacheKey("https://news.google.com/articles/CBMiABC"), "CBMiABC");
  assert.equal(cacheKey("https://www.espn.com/nfl/story/_/id/1"), "https://www.espn.com/nfl/story/_/id/1");
});

test("the shared link cache answers before any lookup", () => {
  const cache = {
    HIT: { url: "https://real/a", image: "https://img/a.jpg" },
    GAVEUP: { url: "https://real/b", tries: 4 },
    TRYING: { tries: 1 },
  };
  assert.deepEqual(fromLinkCache(cache, "https://news.google.com/rss/articles/HIT?oc=5"), { image: "https://img/a.jpg", skip: true });
  assert.deepEqual(fromLinkCache(cache, "https://news.google.com/rss/articles/GAVEUP"), { image: null, skip: true });
  assert.deepEqual(fromLinkCache(cache, "https://news.google.com/rss/articles/TRYING"), { image: null, skip: false });
  assert.deepEqual(fromLinkCache(cache, "https://news.google.com/rss/articles/NEW"), { image: null, skip: false });
  assert.deepEqual(fromLinkCache(null, "https://x.com/a"), { image: null, skip: false });
});
