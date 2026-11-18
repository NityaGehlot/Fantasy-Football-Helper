import { test } from "node:test";
import assert from "node:assert/strict";
import { newPairingCode, formatCode, normalizeCode, PAIRING_TTL_MS } from "../../app/services/pairingCode";

test("pairing codes are 8 unambiguous characters", () => {
  assert.equal(newPairingCode(() => 0), "AAAAAAAA");
  for (let i = 0; i < 1000; i++) assert.match(newPairingCode(), /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(PAIRING_TTL_MS, 600_000);
});

test("codes show as XXXX-XXXX", () => {
  assert.equal(formatCode("ABCDEFGH"), "ABCD-EFGH");
});

test("typed codes are cleaned up, bad ones rejected", () => {
  assert.equal(normalizeCode(" ab3d-ef7h "), "AB3DEF7H");
  assert.equal(normalizeCode("AB0DEF7H"), null);
  assert.equal(normalizeCode("ABC"), null);
});
