import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalysisPrompt, buildQBResponseFormat, buildSkillPositionResponseFormat, buildRosterDecisionResponseFormat,
} from "../../app/backend/services/promptBuilder";
import { LLM_OPTIONS } from "../../app/backend/services/llm";

const build = (pos: string, fmt: string) =>
  buildAnalysisPrompt({ playerData: "DATA\n\n\n\nMORE", comparisons: "", userQuestion: "Q?", responseFormat: fmt, positions: [pos] });

test("prompts keep the accuracy rules and verdict-first format", () => {
  const qb = build("QB", buildQBResponseFormat(["josh allen", "jalen hurts"]));
  assert.match(qb, /Use ONLY the numbers/);
  assert.match(qb, /HIGHER = tougher defense = WORSE matchup/);
  assert.match(qb, /VERDICT: START \[NAME\] over \[NAME\]/);
  assert.match(qb, /JOSH ALLEN \[avg pts\] vs JALEN HURTS/);
  assert.ok(!/\n{4,}/.test(qb), "collapses runs of blank lines");

  const wr = build("WR", buildSkillPositionResponseFormat("WR", ["a", "b"]));
  assert.ok(!wr.includes("defense strength"), "QB-only rule left out for WRs");
  assert.match(wr, /targets, receptions/);
});

test("roster decision format enforces the exact starter count", () => {
  const f = buildRosterDecisionResponseFormat("WR", ["a", "b", "c"], 2);
  assert.match(f, /START \(2\)/);
  assert.match(f, /BENCH \(1\)/);
  assert.match(f, /exactly 2 player/);
});

test("model options leave room for the full prompt and cap answer length", () => {
  assert.ok(LLM_OPTIONS.num_ctx >= 4096);
  assert.ok(LLM_OPTIONS.num_predict > 0 && LLM_OPTIONS.num_predict <= 800);
});
