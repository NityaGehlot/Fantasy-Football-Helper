import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackFor, teamIndex, TEAM_COLORS, teamLogoUrl } from "../app/services/newsFallback";

const players = {
  "9221": { full_name: "Jahmyr Gibbs", team: "DET" },
  "4866": { full_name: "Saquon Barkley", team: "PHI" },
  "1": { full_name: "Free Agent Guy", team: null },
};
const idx = teamIndex(players);

test("one player on one team: card in that team's colours with its logo", () => {
  const f = fallbackFor({ player: "Jahmyr Gibbs", source: "Yahoo Sports" }, idx);
  assert.deepEqual(f, { kind: "team", team: "DET", color: "#0076B6", logo: teamLogoUrl("DET"), source: "Yahoo Sports" });
});

test("several players on different teams, free agents and unknown names: neutral card", () => {
  assert.deepEqual(fallbackFor({ players: ["Jahmyr Gibbs", "Saquon Barkley"], source: "ESPN" }, idx), { kind: "neutral", source: "ESPN" });
  assert.deepEqual(fallbackFor({ player: "Free Agent Guy", source: "NFL.com" }, idx), { kind: "neutral", source: "NFL.com" });
  assert.deepEqual(fallbackFor({ player: "Nobody", source: undefined }, idx), { kind: "neutral", source: "News" });
});

test("all 32 teams have a colour", () => {
  assert.equal(Object.keys(TEAM_COLORS).length, 32);
});

test("two players with the same name on different teams: neutral, not a guess", () => {
  const twins = teamIndex({ a: { full_name: "Josh Allen", team: "BUF" }, b: { full_name: "Josh Allen", team: "JAX" } });
  assert.deepEqual(fallbackFor({ player: "Josh Allen", source: "ESPN" }, twins), { kind: "neutral", source: "ESPN" });
});
