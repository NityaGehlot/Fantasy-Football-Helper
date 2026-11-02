// app/backend/services/injuryImpact.ts
// How injuries around a player change his outlook this week.
//
// Three kinds of injuries matter for a start/sit call:
//  1. Teammates: a backup QB hurts his receivers; an injured WR1 means more targets for the
//     other receivers; an injured lead RB makes the backup a starter; missing linemen hurt
//     the run game and give the QB less time.
//  2. Opponents: missing cornerbacks/safeties help QBs and pass catchers, missing defensive
//     linemen/linebackers help running backs, a backup QB on the other side helps a defense.
//  3. The player himself: playing through a hamstring is riskier than playing through a
//     hand injury, and a concussion means he has to clear protocol first.
// Each rule has a weight from -3 (big downgrade) to +3 (big upgrade) and a plain-English reason
// the AI can repeat.

export type Group = "QB" | "RB" | "WR" | "TE" | "K" | "DEF" | "OL" | "DL" | "LB" | "DB" | "OTHER";

export type InjuredPlayer = {
  name: string;
  position: string;
  status: string; // OUT, IR, DOUBTFUL, QUESTIONABLE, ...
  injury?: string;
  // Sleeper depth chart order at his spot (1 = starter). Unknown = treated as a starter.
  depthOrder?: number | null;
};

export type ImpactNote = {
  source: "teammate" | "opponent" | "self";
  name: string;
  position: string;
  status: string;
  injury: string;
  weight: number; // -3 .. +3, already scaled by how likely he is to miss
  effect: "positive" | "negative" | "neutral";
  reason: string;
};

export function positionGroup(position: string): Group {
  const p = String(position ?? "").toUpperCase().trim();
  if (["QB", "RB", "WR", "TE", "K", "DEF"].includes(p)) return p as Group;
  if (p === "FB" || p === "HB") return "RB";
  if (p === "PK") return "K";
  if (["OT", "T", "LT", "RT", "G", "OG", "LG", "RG", "C", "OL"].includes(p)) return "OL";
  if (["DE", "DT", "NT", "DL", "EDGE"].includes(p)) return "DL";
  if (["LB", "ILB", "OLB", "MLB"].includes(p)) return "LB";
  if (["CB", "S", "FS", "SS", "DB", "SAF"].includes(p)) return "DB";
  return "OTHER";
}

const OUT_LIKE = new Set(["OUT", "IR", "INJURED RESERVE", "PUP", "SUS", "SUSPENDED", "NA", "NOT_ACTIVE", "DOUBTFUL"]);

/** How likely he is to miss the game: 1 for Out/IR/Doubtful, 0.5 for Questionable, 0 otherwise. */
export function missChance(status: string): number {
  const s = String(status ?? "").toUpperCase().trim();
  if (OUT_LIKE.has(s)) return 1;
  if (s === "QUESTIONABLE") return 0.5;
  return 0;
}

type Rule = { weight: number; reason: string };

// TEAMMATE_RULES[player's group][injured teammate's group]
const TEAMMATE_RULES: Partial<Record<Group, Partial<Record<Group, Rule>>>> = {
  QB: {
    WR: { weight: -1, reason: "losing a starting receiver leaves him fewer good targets" },
    TE: { weight: -1, reason: "losing his starting tight end takes away a reliable target" },
    RB: { weight: -0.5, reason: "a weaker run game makes the offense easier to defend" },
    OL: { weight: -1, reason: "a missing offensive lineman means more pressure and sacks" },
  },
  RB: {
    QB: { weight: -1.5, reason: "with the backup QB in, defenses crowd the line and the offense scores less" },
    RB: { weight: 2, reason: "the lead running back is out, so more carries and goal-line work come his way" },
    WR: { weight: 0.5, reason: "a missing receiver can mean a few more check-down targets" },
    TE: { weight: 0.5, reason: "a missing tight end can mean a few more short targets" },
    OL: { weight: -1, reason: "a missing offensive lineman means worse run blocking" },
  },
  WR: {
    QB: { weight: -2, reason: "the backup QB is less accurate and throws for fewer yards" },
    WR: { weight: 1, reason: "another starting receiver is out, so more targets go to him" },
    TE: { weight: 0.5, reason: "the starting tight end is out, freeing up some targets" },
    OL: { weight: -0.5, reason: "less pass protection means quicker, shorter throws" },
  },
  TE: {
    QB: { weight: -2, reason: "the backup QB is less accurate and throws for fewer yards" },
    WR: { weight: 1, reason: "a starting receiver is out, so more targets go to him" },
    TE: { weight: 2, reason: "the starting tight end is out, so he moves into the full-time role" },
    OL: { weight: -0.5, reason: "he may stay in to block more with a lineman missing" },
  },
  K: {
    QB: { weight: -1, reason: "a backup QB means fewer drives that reach field-goal range" },
    OL: { weight: -0.5, reason: "a weaker line stalls more drives" },
  },
  DEF: {
    DL: { weight: -1, reason: "missing a starting pass rusher means fewer sacks" },
    LB: { weight: -0.5, reason: "missing a starting linebacker weakens the run defense" },
    DB: { weight: -1, reason: "missing a starting defensive back means fewer interceptions and more points allowed" },
  },
};

// OPPONENT_RULES[player's group][injured opponent's group]
const OPPONENT_RULES: Partial<Record<Group, Partial<Record<Group, Rule>>>> = {
  QB: {
    DB: { weight: 1, reason: "the opponent is missing a starting defensive back, so coverage is weaker" },
    DL: { weight: 0.5, reason: "the opponent is missing a starting pass rusher, so he'll have more time" },
    LB: { weight: 0.5, reason: "the opponent is missing a starting linebacker" },
  },
  RB: {
    DL: { weight: 1, reason: "the opponent is missing a starting defensive lineman, so running lanes open up" },
    LB: { weight: 1, reason: "the opponent is missing a starting linebacker, which weakens their run defense" },
    DB: { weight: 0.5, reason: "the opponent is missing a starting defensive back, which helps on long runs" },
  },
  WR: {
    DB: { weight: 1.5, reason: "the opponent is missing a starting cornerback or safety, so coverage is weaker" },
    DL: { weight: 0.5, reason: "less pass rush gives his QB more time for deep throws" },
  },
  TE: {
    LB: { weight: 1, reason: "the opponent is missing a starting linebacker, who usually covers tight ends" },
    DB: { weight: 1, reason: "the opponent is missing a starting safety or cornerback" },
  },
  K: {},
  DEF: {
    QB: { weight: 2.5, reason: "the opponent is starting a backup QB, so more turnovers and fewer points allowed" },
    OL: { weight: 1, reason: "the opponent is missing an offensive lineman, so more sacks are likely" },
    WR: { weight: 0.5, reason: "the opponent is missing a starting receiver" },
    RB: { weight: 0.5, reason: "the opponent is missing their lead running back" },
  },
};

// The player's own injury: how much it limits him when he does play.
const SELF_RULES: [RegExp, number, string][] = [
  [/concussion|head/i, -1.5, "a concussion means he must clear the league's protocol, and he may be limited or ruled out late"],
  [/hamstring|groin|calf|quad|thigh/i, -1.5, "soft-tissue injuries are easy to re-aggravate and limit speed, so he may play fewer snaps"],
  [/achilles|acl|mcl|knee/i, -1.5, "a knee injury limits cutting and explosiveness"],
  [/ankle|foot|toe|heel/i, -1, "an ankle or foot injury limits cutting and speed"],
  [/shoulder|elbow|wrist|hand|finger|thumb/i, -0.5, "an upper-body injury can affect catching or throwing"],
  [/back|rib|chest|oblique|hip|neck/i, -0.5, "it can limit his snaps and how hard he plays"],
  [/illness|personal|rest/i, 0, "it isn't an injury that limits him once he plays"],
];

export function selfInjuryNote(position: string, status: string, injury = ""): ImpactNote | null {
  const s = String(status ?? "").toUpperCase().trim();
  if (!s || s === "ACTIVE" || s === "N/A") return null;
  if (OUT_LIKE.has(s) && s !== "DOUBTFUL") {
    return { source: "self", name: "", position, status: s, injury, weight: -3, effect: "negative", reason: "he is not expected to play" };
  }
  const match = SELF_RULES.find(([re]) => re.test(injury));
  const base = match ? match[1] : -1;
  const why = match ? match[2] : "the injury could limit his snaps";
  // Doubtful players rarely play; questionable ones usually do but carry risk.
  const weight = s === "DOUBTFUL" ? -2.5 : base;
  const reason = s === "DOUBTFUL" ? `he is doubtful (usually means he won't play), and ${why}` : `he is questionable and ${why}`;
  return { source: "self", name: "", position, status: s, injury, weight, effect: weight < 0 ? "negative" : "neutral", reason };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Only starters move the needle. Sleeper numbers the depth chart per spot (LWR, RWR, SWR,
// LT, LG, ...), so a starting receiver or lineman is order 1 at his own spot.
function isStarter(p: InjuredPlayer): boolean {
  if (p.depthOrder === null || p.depthOrder === undefined) return true;
  return p.depthOrder <= 1;
}

/**
 * Notes for one player: his own injury, injured starters on his team, and injured starters
 * on the opponent. `isBackup` marks a player behind an injured starter at his own position
 * (a backup RB/TE whose starter is out gets the bump; the injured starter himself doesn't).
 */
export function injuryImpacts({
  playerName,
  position,
  ownStatus = "",
  ownInjury = "",
  teammates = [],
  opponents = [],
}: {
  playerName: string;
  position: string;
  ownStatus?: string;
  ownInjury?: string;
  teammates?: InjuredPlayer[];
  opponents?: InjuredPlayer[];
}): ImpactNote[] {
  const group = positionGroup(position);
  const notes: ImpactNote[] = [];
  const self = selfInjuryNote(position, ownStatus, ownInjury);
  if (self) notes.push({ ...self, name: playerName });

  const add = (source: "teammate" | "opponent", p: InjuredPlayer, rule: Rule | undefined) => {
    const chance = missChance(p.status);
    if (!rule || chance === 0 || !isStarter(p)) return;
    const weight = round1(rule.weight * chance);
    notes.push({
      source,
      name: p.name,
      position: String(p.position).toUpperCase(),
      status: String(p.status).toUpperCase(),
      injury: p.injury ?? "",
      weight,
      effect: weight > 0 ? "positive" : weight < 0 ? "negative" : "neutral",
      reason: chance < 1 ? `${rule.reason} (only if he sits; he is questionable)` : rule.reason,
    });
  };

  const self_norm = playerName.toLowerCase().trim();
  for (const t of teammates) {
    if (t.name.toLowerCase().trim() === self_norm) continue;
    add("teammate", t, TEAMMATE_RULES[group]?.[positionGroup(t.position)]);
  }
  for (const o of opponents) add("opponent", o, OPPONENT_RULES[group]?.[positionGroup(o.position)]);
  return notes;
}

export function netImpact(notes: ImpactNote[]): { score: number; label: string } {
  // His own status matters most; the rest add up but are capped so one game can't swing wildly.
  const own = notes.filter(n => n.source === "self").reduce((t, n) => t + n.weight, 0);
  const others = Math.max(-3, Math.min(3, notes.filter(n => n.source !== "self").reduce((t, n) => t + n.weight, 0)));
  const score = round1(own + others);
  const label =
    score >= 2 ? "big boost" : score >= 0.5 ? "slight boost" : score > -0.5 ? "no real effect" : score > -2 ? "slight downgrade" : "big downgrade";
  return { score, label };
}

export function formatImpactBlock(notes: ImpactNote[]): string {
  if (notes.length === 0) return "No injuries on his team or the opponent that change his outlook.";
  const lines = notes.map(n => {
    const who = n.source === "self" ? "His own injury" : `${n.source === "teammate" ? "Teammate" : "Opponent"} ${n.name} (${n.position})`;
    const sign = n.weight > 0 ? `+${n.weight}` : `${n.weight}`;
    return `• ${who}: ${n.status}${n.injury ? `, ${n.injury}` : ""} → ${n.effect} (${sign}) — ${n.reason}`;
  });
  const net = netImpact(notes);
  return `${lines.join("\n")}\nNet injury effect: ${net.score > 0 ? "+" : ""}${net.score} (${net.label}). Scale: -3 = big downgrade, +3 = big boost.`;
}
