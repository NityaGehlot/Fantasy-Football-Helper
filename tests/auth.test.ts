import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyAuthError, isValidEmail, passwordChecks, passwordStrength, isAcceptablePassword } from "../app/services/authHelpers";

test("Firebase errors become plain English", () => {
  assert.match(friendlyAuthError({ code: "auth/invalid-email" }), /doesn't look right/);
  assert.match(friendlyAuthError({ message: "Firebase: Error (auth/too-many-requests)." }), /Too many attempts/);
  assert.match(friendlyAuthError({ code: "auth/expired-action-code" }), /expired/);
  assert.equal(friendlyAuthError(new Error("weird"), "Fallback"), "Fallback");
});

test("email validation", () => {
  assert.equal(isValidEmail("nitya@gmail.com"), true);
  assert.equal(isValidEmail(" nitya@gmail.com "), true);
  assert.equal(isValidEmail("nitya@gmail"), false);
  assert.equal(isValidEmail("no spaces@x.com"), false);
});

test("password strength and checks", () => {
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("abc"), 1);
  assert.equal(passwordStrength("abcdefgh"), 1);
  assert.equal(passwordStrength("abcdefgh1"), 2);
  assert.equal(passwordStrength("Abcdefgh1!"), 3);
  assert.deepEqual(passwordChecks("Abcdefg1").map(c => c.ok), [true, true, true]);
  assert.equal(isAcceptablePassword("1234567"), false);
  assert.equal(isAcceptablePassword("12345678"), true);
});
