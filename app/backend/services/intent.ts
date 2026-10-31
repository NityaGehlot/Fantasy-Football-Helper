// app/backend/services/intent.ts
// Decide what kind of question the user is asking so the right data and prompt are used.

export type ChatIntent = "trade" | "waiver" | "draft" | "start_sit" | "general";

const PATTERNS: [ChatIntent, RegExp][] = [
  ["trade", /\btrad(e|es|ing|ed)\b|\bdeal for\b|\bsell high\b|\bbuy low\b|\boffer\b/],
  ["waiver", /\bdrop\b|\bpick ?up\b|\bwaivers?\b|\bfree agents?\b|\badd\b|\bstream(ing|er)?\b|\bclaim\b|\bfaab\b/],
  ["draft", /\bdraft(ing|ed)?\b|\bpick (at|with)\b|\bround \d|\bmock\b|\badp\b|\bsleepers?\b/],
  ["start_sit", /\bstart\b|\bsit\b|\bbench\b|\blineup\b|\bflex\b|\bplay\b|\bwho should i (use|go with)\b|\bor\b/],
];

export function detectIntent(message: string): ChatIntent {
  const lower = message.toLowerCase();
  for (const [intent, pattern] of PATTERNS) {
    if (pattern.test(lower)) return intent;
  }
  return "general";
}
