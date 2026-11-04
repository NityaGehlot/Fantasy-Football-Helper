import { test } from "node:test";
import assert from "node:assert/strict";
import { describeOfferCheck } from "../app/services/tradeGrader";
import { practiceTable } from "../app/services/injuryFormat";

test("trade offer check summary", () => {
  assert.equal(
    describeOfferCheck({ weeks: [8, 9, 10], transactions: 14, trades: 2, statuses: { complete: 2 }, involvingYou: 0 }),
    "Checked Sleeper for weeks 8–10: 14 transactions, 2 trades (2 complete), 0 involving you."
  );
  assert.equal(describeOfferCheck(undefined), "");
});

test("practice from a news report is labeled", () => {
  const rows = practiceTable([{ date: "2026-11-03", day: "Tue", status: "QUESTIONABLE", practice_status: "DNP", practice_source: "news" }] as any);
  assert.equal(rows[0].practiceLabel, "Did not practice (news report)");
});
