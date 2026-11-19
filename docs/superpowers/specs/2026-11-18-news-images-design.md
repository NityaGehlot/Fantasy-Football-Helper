# News images for every article

Date: 2026-11-18 · Project 2 of 7 (round 14) · Approach A (chosen by the user)

## Intent

Almost every news article in the app should show its real cover picture, the one you see when you
open the article on the web. Today 3,228 of 4,013 player articles (80%) arrive with no image.
Research (`reports/Free NFL news feeds with images.md`) found the cause: 3,116 of those never had
their Google News redirect link turned into the real article address, so no page was ever read.
Where the address was found, 88% got a picture (785 of 897).

## Goals

- Raise the share of player articles with a real cover image from ~20% to 85%+, measured in each
  news run's log.
- Never look up the same Google link twice; failures retry a few times with growing waits, then stop.
- Add ESPN's per-player fantasy news (comes with large images and real links).
- Every card that still has no picture (or whose picture fails to load) shows a deliberate,
  team-colored fallback instead of an empty grey box.

## Non-goals

- Replacing Google News as a source (Bing RSS is a possible later extra).
- Paid/hosted preview APIs. Downloading and re-hosting images (later, if hotlink blocking shows up).

## Anti-goals

- Hammering Google or publishers (must stay paced and polite; stop on HTTP 429).
- Spoofing other companies' bots or bypassing paywalls/bot protection.
- Making the news job much slower than today's ~25 minutes.
- Showing a site's generic logo as if it were the article's picture.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Fix the lookup (permanent cache, paced newest-first, bigger budget), add ESPN player feed, better extraction, app fallback card | Free, fixes the real bottleneck; still depends on Google's unofficial decode step |
| B | Switch to Bing News RSS (link + thumbnail in the feed) | Undocumented, small thumbnails, untested from here |
| C | Hosted link-preview API | Free tiers are 25–100 lookups/month or day: far too small |

## Design

### nfl-data (R news job)

1. **Permanent link cache** `data/news/link_cache.json`: Google article id (or the link for
   non-Google links) → `{ url, image, tries, last_try }` (ISO date). Loaded at the start of each
   run, merged with what's in the news files (so nothing learned so far is lost), written at the end
   and committed with the news files. Entries not seen for 45 days are dropped to keep it small.
   - Success (`image` set) is never looked up again.
   - Failure: retry only after `2^tries` hours have passed since `last_try`; give up after 4 tries.
   - Found `url` but no image: next attempt reads only the page (no Google step).
2. **Budget**: default `MAX_NEW_IMAGES` 300 → 1500 per run, plus a time cap
   (`IMAGE_MINUTES`, default 15; 90 for a manual backfill run). Google decodes paced at
   ~1/second (today 0.4s). On HTTP 429 from Google: stop Google decodes for this run but keep
   reading pages for links whose real address is already known.
3. **Run summary in the log**: e.g.
   `Images: 812 looked up (640 found, 150 no image, 22 rate-limited) · 3,401 of 4,016 articles have a picture (85%)`.
4. **ESPN player news**: for fantasy positions (QB/RB/WR/TE/K) with an ESPN id
   (Sleeper `espn_id`, else nflverse id map), fetch
   `site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId={id}&limit=10`; keep Story/
   Video items with an image and a web link (skip Rotowire blurbs, which have neither); merge into
   that player's articles the same way ESPN team news is merged today. Paced 0.2s; cached per run.
5. **Better extraction** (`extract_share_image`): keep og/twitter/JSON-LD/image_src order; add
   the largest article `<img>` (src, data-src, srcset) when nothing else is found; reject URLs that
   look like a site default (`logo`, `sprite`, `placeholder`, `default`, `favicon`, `blank`) and
   known per-site default images.

### Fantasy-Football-Helper

6. **Backend `/article-images`** reads `link_cache.json` from nfl-data (raw GitHub, cached 30 min)
   first and only does its own lookup for links the cache has never seen; it respects the cache's
   "gave up" entries.
7. **Fallback card** in `NewsCardRow` (and the League news carousel): when an article has no image
   or the image fails to load (`onError`), show a card in the player's team colors with the team
   logo and the source name, instead of the current tinted icon box. Team comes from the player
   database the screens already load.

## Calls made after the builder check (author's calls, check these)

- **Ramp, plus a one-time catch-up.** About 3,100 links are waiting. A normal run spends at most 15
  extra minutes on lookups (roughly 300–600 links), so coverage climbs over about a day of runs.
  The workflow also gets a manual **"backfill" option** (Actions → Update NFL News → Run workflow,
  minutes = 90) to clear the backlog in one go at the same polite pace.
- **Lookup time is on top of today's ~25 minutes** (worst case ~45 minutes per run; GitHub allows 6 hours).
- **ESPN player news only for players on an NFL team** (~760 fantasy-position players, about 4–6
  minutes). ESPN ids come from nflverse's player id map (`nflreadr::load_ff_playerids()`, matched by
  `sleeper_id`), because nfl-data's Sleeper export has no `espn_id`.
- **Fallback card without one team**: league-wide headlines, multi-player stories and free agents
  get a neutral card (source name + newspaper icon in the app's colours). Team colours only when the
  article is about one player on one team. Home's "Around the League" stays neutral (it doesn't load
  the player database).

## Testing

- R unit tests (`scripts/tests/`): cache key from Google link, retry timing (`2^tries` hours,
  give-up at 4), merge of old files + cache, pruning, budget/time cap, 429 behaviour (stops Google,
  continues page reads), extraction fallbacks and logo rejection, ESPN player-news parsing.
- TS tests: backend uses cache hits and skips "gave up" links; fallback picks team colors/logo.
- Real-world check: the next GitHub run's summary line (the user can trigger it from Actions).

## Left to the builder

File/function names, exact log wording, the team colour table source, card styling details.
