# News Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get a real cover image onto 85%+ of player news articles, and a deliberate fallback card on the rest.

**Architecture:** nfl-data's news job gains a permanent link cache (`data/news/link_cache.json`) that remembers every Google→real-URL decode and image, a paced newest-first lookup budget with a time cap, ESPN per-player fantasy news, and a deeper image extractor. The app's backend reads the same cache before doing its own lookups, and news cards fall back to a team/neutral card when there's no picture or it fails to load.

**Tech Stack:** R (httr, jsonlite) on GitHub Actions; TypeScript (Express backend, React Native web), node:test.

**Spec:** `docs/superpowers/specs/2026-11-18-news-images-design.md` (in Fantasy-Football-Helper)

## Global Constraints

- Patch delivery only; nothing is committed or pushed. "Checkpoint" = tests pass.
- nfl-data patches contain only `scripts/` and `.github/` (the user's clone is sparse).
- Google decodes paced ~1/second; on HTTP 429 stop Google decodes for the run, keep reading pages whose real URL is known.
- Defaults: `MAX_NEW_IMAGES` 1500, `IMAGE_MINUTES` 15 (manual backfill input: 90).
- Retry a failure only after `2^tries` hours since `last_try`; give up at 4 tries. Successes never re-looked-up.
- Cache entries not seen for 45 days are dropped.
- ESPN player news only for QB/RB/WR/TE/K players on an NFL team; Story/Video items with an image and a web link only; paced 0.2s.
- Reject image URLs matching `logo|sprite|placeholder|default|favicon|blank` (case-insensitive).
- Fallback card: team colours + logo only when the article is about one player on one team; otherwise neutral (source name + newspaper icon).
- Honest User-Agent; no bot spoofing; no paywall/bot-protection bypass.

## Review Focus

1. A run that hits Google's 429 on its first decode → must still write all news files and the cache (no crash, no lost entries) and log `rate-limited`.
2. A corrupt or missing `link_cache.json` (first run, bad JSON) → run proceeds with an empty cache seeded from the news files.
3. ESPN id map download fails → news job still completes without ESPN player items.
4. An image URL that loads in the feed but 403s in the app (hotlink block) → card switches to the fallback via `onError`, no broken image box.
5. The same article listed for two players (two news files) → looked up once, both copies get the image.

---

### Task 1: Link cache (R)

**Files:** Create `scripts/link_cache.R`; Test `scripts/tests/test_link_cache.R`

**Interfaces — Produces:**
- `cache_key(link)` → Google article id for news.google.com links, else the link itself.
- `load_link_cache(path)` → named list (key → list(url, image, tries, last_try, seen)); `list()` on missing/corrupt file.
- `seed_cache_from_articles(cache, articles)` → cache with entries for articles that already have `url`/`image`/`image_tries` (from the previous run's files).
- `needs_lookup(entry, now)` → TRUE when entry is NULL, or no image and tries < 4 and `now - last_try >= 2^tries hours`.
- `record_result(cache, key, url, image, now)` → updates entry (image found → keep; else tries+1, last_try=now); always sets `seen` = today.
- `prune_cache(cache, today, days = 45)` and `save_link_cache(cache, path)`.

- [ ] Step 1: tests — `cache_key` of `https://news.google.com/rss/articles/CBMiABC?oc=5` is `"CBMiABC"`, of `https://x.com/a` is itself; corrupt file → `list()`; `needs_lookup(NULL)` TRUE; entry tries=1,last_try=now-1h → FALSE, now-2h → TRUE; tries=4 → FALSE; entry with image → FALSE; prune drops `seen` 46 days ago, keeps 44; seeding copies `url`/`image` and maps `image_tries`→`tries`; record_result on failure increments tries.
- [ ] Step 2: run `Rscript scripts/tests/test_link_cache.R` → fails (file missing).
- [ ] Step 3: implement; Step 4: run → all ok.

### Task 2: Lookup planner with budget, time cap, 429 handling (R)

**Files:** Modify `scripts/article_images.R` (`plan_image_lookups`, `attach_images`, `new_image_budget`); Test `scripts/tests/test_article_images.R`

**Interfaces — Consumes:** Task 1. **Produces:**
- `new_image_budget(n, minutes, clock = Sys.time)` env with `left`, `deadline`, `google_stopped`, counters `looked_up`, `found`, `no_image`, `rate_limited`.
- `plan_image_lookups(article_lists, cache, n, now)` → unique links, newest first, where `needs_lookup(cache[[cache_key(link)]], now)`.
- `attach_images(articles, cache, budget, lookups, fetch = fetch_article_image, page = page_image, delay = 1)` → list(articles, cache): copies cached url/image onto every article with that key; looks up planned links while `left > 0` and before `deadline`; when `google_stopped`, only links with a known url (page read only).
- `image_summary(budget, article_lists)` → one log line: `Images: N looked up (F found, X no image, R rate-limited) · H of T articles have a picture (P%)`.

- [ ] Step 1: tests with stub `fetch`/`page` — duplicate link in two lists looked up once and both get image (Review Focus 5); stub returns `rate_limited=TRUE` on first call → later Google links skipped, a known-url link still gets `page()` (Review Focus 1); deadline in the past → no lookups; summary string for 3 of 4 with images = `"... · 3 of 4 articles have a picture (75%)"`.
- [ ] Step 2: run → fails. Step 3: implement. Step 4: run `Rscript scripts/tests/test_article_images.R` → ok (existing checks still ok).

### Task 3: Deeper image extraction + logo rejection (R)

**Files:** Modify `scripts/article_images.R` (`extract_share_image`, `other_image`); Test `scripts/tests/test_article_images.R`

**Interfaces — Produces:** `is_default_image(url)` → TRUE for the Global Constraints pattern; `largest_article_img(html, page_url)` → best `<img>` src/data-src/srcset (largest width hint, else first in `<article>`), absolute https, not default.

- [ ] Step 1: tests — og:image `https://site.com/logo.png` + an article img `https://site.com/photo-1200.jpg` → photo; page with only `<img data-src="/a/p.jpg" width="800">` → `https://host/a/p.jpg`; srcset picks the largest `w`; `is_default_image("https://x/favicon.ico")` TRUE.
- [ ] Steps 2–4: fail → implement → pass.

### Task 4: ESPN per-player fantasy news (R)

**Files:** Modify `scripts/espn_news.R`; Test `scripts/tests/test_espn_news.R`

**Interfaces — Produces:**
- `ESPN_PLAYER_NEWS_URL <- "https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=%s&limit=10"`
- `parse_espn_player_news(data, player_name)` → articles (title, source "ESPN", link, url, image, published, player) for Story/Video items with image + web link; skips Rotowire.
- `load_espn_ids(get_csv)` → named vector sleeper_id → espn_id from `https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv`; empty on failure (Review Focus 3).
- `fetch_espn_player_news(players, ids, get_json, delay = 0.2)` → list player_name → articles, for players with team + fantasy position + espn id.

- [ ] Step 1: tests on a fixture JSON (one Story with images+links, one Rotowire without) → 1 article with `image` and `link`; failing `get_csv` → empty vector; player without team skipped.
- [ ] Steps 2–4: fail → implement → pass.

### Task 5: Wire into the news job + workflow (R/YAML)

**Files:** Modify `scripts/generate_nfl_news.R`, `.github/workflows/update-news.yml`

- [ ] Step 1: in `generate_nfl_news.R`: load + seed cache (Task 1), merge ESPN player items into each player's list (like ESPN team news, deduped by link), plan + attach (Task 2) across all positions with `MAX_NEW_IMAGES` (1500) / `IMAGE_MINUTES` (15), prune + save cache, `message(image_summary(...))`.
- [ ] Step 2: workflow: `workflow_dispatch.inputs.image_minutes` (default "15"); env `IMAGE_MINUTES: ${{ inputs.image_minutes || '15' }}`; run `test_link_cache.R` and `test_article_images.R` in the test step; `git add data/news/*.json` already includes the cache.
- [ ] Step 3: dry run locally with `MAX_NEW_IMAGES=0` (no network lookups): job completes, writes files + `link_cache.json`, prints the summary line.

### Task 6: Backend reads the shared cache (TS)

**Files:** Modify `app/backend/services/articleImages.ts`; Test `tests/backend/newsImages.test.ts`

**Interfaces — Produces:** `LINK_CACHE_URL = "https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/news/link_cache.json"`; pure `fromLinkCache(cache, link)` → `{ image: string | null; skip: boolean }` (hit with image → image; tries ≥ 4 → skip; unknown → neither); `cacheKey(link)` same rule as R.

- [ ] Step 1: tests for `cacheKey` and `fromLinkCache` (hit, gave-up, unknown).
- [ ] Steps 2–4: fail → implement (imagesForArticles consults the cache, fetched with 30-min TTL, before `imageForArticle`) → pass.

### Task 7: Fallback card (TS/React)

**Files:** Create `app/services/newsFallback.ts`; Modify `app/components/NewsCardRow.tsx`, `app/components/LeagueNewsCarousel.tsx`; Test `tests/newsFallback.test.ts`

**Interfaces — Produces:** `fallbackFor(article, players)` → `{ kind: 'team'; team: string; color: string; logo: string } | { kind: 'neutral'; source: string }` (team only when exactly one named player with one team); `TEAM_COLORS` (32 teams, primary hex).

- [ ] Step 1: tests — one DET player → `{kind:'team', team:'DET', color:'#0076B6'}`; two players on different teams → neutral; unknown player → neutral with source.
- [ ] Steps 2–4: fail → implement → pass.
- [ ] Step 5: NewsCardRow: `players` prop (optional), `onError` per card switches to fallback (Review Focus 4); carousel uses neutral. Screenshot both via the run skill.

### Task 8: Reviews and delivery

- [ ] security-review and code-review skills on both repos' changes; fix Critical/Important.
- [ ] verification-before-completion: R tests, `npm test`, `npm run typecheck`, dry run.
- [ ] Build `Fantasy-Football-Helper-v17.patch` (diff against the saved v16 tree) and `nfl-data-v14.patch` (scripts + .github only); check both apply.
