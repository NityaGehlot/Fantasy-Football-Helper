import { test } from "node:test";
import assert from "node:assert/strict";
import { assignKeepingCurrent, compareLineups } from "../../app/backend/services/lineupCheck";

const pl = (id: string, name: string, position: string, value: number) => ({ id, name, position, team: "X", injuryStatus: "ACTIVE", value });

test("lineup check: Vele replaces Shakir directly instead of shuffling Wilson", () => {
  const players = [
    pl("shakir", "K. Shakir", "WR", 8.1),
    pl("wr2", "WR Two", "WR", 13.5),
    pl("mwilson", "M. Wilson", "WR", 9.2),
    pl("vele", "D. Vele", "WR", 11.7),
    pl("rb1", "RB One", "RB", 14.2),
  ];
  const slots = ["RB", "WR", "WR", "FLEX"] as any;
  const out = compareLineups(players, ["rb1", "shakir", "wr2", "mwilson"], slots);
  assert.equal(out.swaps.length, 1);
  assert.equal(out.swaps[0].start.name, "D. Vele");
  assert.equal(out.swaps[0].bench?.name, "K. Shakir");
  assert.equal(out.swaps[0].slot, "WR");
  assert.equal(out.swaps[0].from, undefined);
  assert.equal(out.swaps[0].movesTo, undefined);
  assert.equal(out.swaps[0].gain, 3.6);
  assert.equal(out.bestPoints, 48.6);
});

test("assignment keeps current starters in place and only moves when it must", () => {
  const players = [pl("a", "A", "WR", 10), pl("b", "B", "RB", 9), pl("c", "C", "RB", 8)];
  // B is in FLEX, the RB spot holds a benched player; best: C into RB, B stays at FLEX.
  const slots = [
    { slot: "RB" as const, current: "old" },
    { slot: "WR" as const, current: "a" },
    { slot: "FLEX" as const, current: "b" },
  ];
  assert.deepEqual(assignKeepingCurrent(players, slots as any), ["c", "a", "b"]);
});

test("lineup values keep two decimals", () => {
  const out = compareLineups([pl("a", "A", "QB", 17.46), pl("b", "B", "QB", 12.11)], ["b"], ["QB"] as any);
  assert.equal(out.currentPoints, 12.11);
  assert.equal(out.bestPoints, 17.46);
  assert.equal(out.swaps[0].gain, 5.35);
});

import { extractShareImage, youtubeThumbnail } from "../../app/backend/services/articleImages";

test("article images: fallbacks for sites without og:image, and YouTube thumbnails", () => {
  assert.equal(extractShareImage('<link rel="image_src" href="/i/a.jpg">', "https://www.usatoday.com/story/x"), "https://www.usatoday.com/i/a.jpg");
  assert.equal(extractShareImage('<meta itemprop="image" content="https://cdn.x.com/b.jpg">', "https://x.com"), "https://cdn.x.com/b.jpg");
  assert.equal(
    extractShareImage('{"@type":"NewsArticle","image":{"@type":"ImageObject","url":"https:\\/\\/a.espncdn.com\\/photo\\/c.jpg"}}', "https://www.espn.com/nfl"),
    "https://a.espncdn.com/photo/c.jpg"
  );
  assert.equal(youtubeThumbnail("https://youtu.be/daWf3JrO7Lw?is=3r7"), "https://i.ytimg.com/vi/daWf3JrO7Lw/hqdefault.jpg");
  assert.equal(youtubeThumbnail("https://www.espn.com/x"), null);
});

import { moveWarnings, positionCounts, positionTargets, surplusPositions, balanceSummary } from "../../app/backend/services/positionBalance";
import { rankDropCandidates } from "../../app/backend/services/waiver";

const STD = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"] as any;
const tp = (id: string, position: string, value: number) => ({ id, name: `${position}${id}`, position, team: "X", injuryStatus: "ACTIVE", value });

test("position targets follow the league's lineup", () => {
  const t = positionTargets(STD);
  assert.deepEqual(t.QB, { min: 1, max: 2 });
  assert.deepEqual(t.RB, { min: 3, max: 6 });
  assert.deepEqual(t.WR, { min: 3, max: 6 });
  assert.deepEqual(t.TE, { min: 1, max: 2 });
  assert.deepEqual(t.K, { min: 1, max: 1 });
  assert.deepEqual(t.DEF, { min: 1, max: 1 });
  assert.deepEqual(positionTargets([...STD, "SUPER_FLEX"]).QB, { min: 2, max: 3 });
});

test("roster balance warnings for adds and drops", () => {
  const t = positionTargets(STD);
  const roster = [tp("1", "QB", 20), tp("2", "RB", 15), tp("3", "RB", 12), tp("4", "RB", 8), tp("5", "TE", 9)];
  const thin = moveWarnings(roster, { add: tp("9", "WR", 10), drop: roster[3] }, t);
  assert.match(thin.join(" "), /leaves you with 2 RBs/);
  const many = moveWarnings([...roster, tp("6", "QB", 14)], { add: tp("9", "QB", 10), drop: roster[3] }, t);
  assert.match(many.join(" "), /gives you 3 QBs/);
  assert.deepEqual(moveWarnings(roster, { add: tp("9", "RB", 10), drop: roster[3] }, t), []);
  assert.deepEqual(surplusPositions(positionCounts([tp("1", "QB", 1), tp("2", "QB", 1), tp("3", "QB", 1), tp("4", "QB", 1)]), t), ["QB"]);
  assert.match(balanceSummary([tp("1", "QB", 1), tp("2", "QB", 1), tp("3", "QB", 1)] as any, t), /QB 3 \(recommended 1-2\) \(TOO MANY\)/);
});

test("drop advice prefers a surplus position when the lineup cost is about the same", () => {
  // Four QBs: the 4th QB and the backup RB both cost the lineup nothing; drop the QB.
  const roster = [
    tp("q1", "QB", 20), tp("q2", "QB", 6), tp("q3", "QB", 5.5), tp("q4", "QB", 5),
    tp("r1", "RB", 15), tp("r2", "RB", 12), tp("r3", "RB", 4.5),
    tp("w1", "WR", 14), tp("w2", "WR", 13), tp("w3", "WR", 9),
    tp("t1", "TE", 8), tp("k", "K", 7), tp("d", "DEF", 6),
  ];
  const options = rankDropCandidates(roster, tp("add", "WR", 10), STD);
  assert.equal(options[0].drop.position, "QB");
  assert.match(options[0].notes!.join(" "), /You have 4 QBs and this league only needs about 1-2/);
});
