import { test } from "node:test";
import assert from "node:assert/strict";
import { currentInjury, indexInjuries, injuryLabel, injuryShort, isOutStatus, practiceTable, type InjuryFile } from "../app/services/injuryFormat";

const file: InjuryFile = {
  generated_at: "2026-10-31T23:30:00Z", season: 2026, week: 9,
  players: [
    { player_id: "4881", full_name: "Romeo Doubs", team: "GB", position: "WR", status: "IR", injury: "Hamstring", history: [] },
    {
      player_id: "300", full_name: "Kenneth Walker III", team: "SEA", position: "RB", status: "QUESTIONABLE", injury: "Ankle",
      history: [
        { date: "2026-10-30", day: "Thu", practice_status: "LP", status: "QUESTIONABLE" },
        { date: "2026-10-29", day: "Wed", practice_status: "DNP", status: "QUESTIONABLE" },
        { date: "2026-10-31", day: "Fri", practice_status: "LP", game_status: "QUESTIONABLE", status: "QUESTIONABLE" },
      ],
    },
  ],
};

test("injury lookup by id, then name+team, then Sleeper's own fields", () => {
  const idx = indexInjuries(file);
  assert.equal(currentInjury(idx, { player_id: "4881" }).status, "IR");
  assert.equal(currentInjury(idx, { player_id: "x", full_name: "Kenneth Walker", team: "SEA" }).injury, "Ankle");
  const fallback = currentInjury(idx, { player_id: "9", injury_status: "Out", injury_body_part: "Knee" });
  assert.deepEqual([fallback.status, fallback.injury, fallback.record], ["OUT", "Knee", null]);
  assert.equal(currentInjury(indexInjuries(null), { player_id: "1" }).status, "");
});

test("labels and the practice report table", () => {
  assert.equal(injuryLabel("IR"), "Injured Reserve");
  assert.equal(injuryShort("QUESTIONABLE"), "Q");
  assert.equal(isOutStatus("IR"), true);
  assert.equal(isOutStatus("QUESTIONABLE"), false);
  const rows = practiceTable(file.players[1].history);
  assert.deepEqual(rows.map(r => r.day), ["Wed", "Thu", "Fri"]);
  assert.deepEqual(rows.map(r => r.practiceLabel), ["Did not practice", "Limited", "Limited"]);
  assert.equal(rows[2].status, "Questionable");
});
