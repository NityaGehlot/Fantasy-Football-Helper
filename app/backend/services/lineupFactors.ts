// app/backend/services/lineupFactors.ts
// How the lineup check decides between players. Sleeper's projection is the main factor (it's
// also the number shown), then it's adjusted for what the projection may not fully capture:
//
//  • The defense he faces, weighed by how good he is. A tough defense barely matters for one of
//    the best players at his position (you start him anyway), matters fully for an average
//    starter, and a bit more for a low-ranked one. A weak defense is a plus for everyone.
//  • Injuries around him: a backup QB hurts his receivers and tight ends (and the RB a little,
//    as defenses crowd the line), the lead back being out means more carries for the next RB, a
//    starting receiver out sends more targets to the others, a missing lineman hurts the run game
//    and protection, and injured defenders on the other side open things up.
//  • Weather, and his own injury when he's questionable.

import type { MatchupParts } from "./matchupContext";
import type { PlayerRank } from "./playerRanks";

export type Tier = "elite" | "starter" | "depth" | "unknown";

// Position rank cut-offs this season (12-team leagues): elite = a weekly must-start.
const ELITE: Record<string, number> = { QB: 6, RB: 12, WR: 12, TE: 6, K: 6, DEF: 6 };
const DEPTH: Record<string, number> = { QB: 18, RB: 30, WR: 36, TE: 15, K: 15, DEF: 15 };

export function tierOf(position: string, rank?: PlayerRank | null): Tier {
  if (!rank?.position) return "unknown";
  const pos = String(position).toUpperCase();
  if (rank.position <= (ELITE[pos] ?? 12)) return "elite";
  if (rank.position > (DEPTH[pos] ?? 30)) return "depth";
  return "starter";
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

export type Decision = {
  // What decides who starts: projection x adjustment
  score: number;
  factor: number;
  tier: Tier;
  // Plain-English reasons, most important first
  reasons: string[];
};

export function decide(
  projection: number,
  position: string,
  components: MatchupParts | null | undefined,
  rank?: PlayerRank | null,
  injuryReasons: string[] = []
): Decision {
  const tier = tierOf(position, rank);
  const pos = String(position).toUpperCase();
  const reasons: string[] = [];
  let defense = components?.defense ?? 0;
  if (components && components.defenseRank !== null) {
    const of = `${components.defenseRank} of ${components.defenseTeams}`;
    if (defense < 0) {
      const scale = tier === "elite" ? 0.35 : tier === "depth" ? 1.25 : 1;
      defense *= scale;
      reasons.push(
        tier === "elite"
          ? `Tough defense (ranks ${of} vs ${pos}s), but he's ${pos}${rank!.position} this season, so you start him anyway (${pct(defense)})`
          : tier === "depth"
            ? `Tough defense (ranks ${of} vs ${pos}s) and he's only ${pos}${rank!.position} this season: risky (${pct(defense)})`
            : `Tough defense (ranks ${of} vs ${pos}s) (${pct(defense)})`
      );
    } else if (defense > 0) {
      reasons.push(`Weak defense (ranks ${of} vs ${pos}s): a plus (${pct(defense)})`);
    }
  }
  const weather = components?.weather ?? 0;
  const injury = components?.injury ?? 0;
  if (injury) reasons.push(...injuryReasons.map(r => `${r}`));
  if (weather) reasons.push(`Weather ${pct(weather)}`);
  const factor = Math.max(0.7, Math.min(1.3, 1 + defense + weather + injury));
  const score = Math.round(projection * factor * 100) / 100;
  if (projection > 0) reasons.unshift(`Projected ${projection.toFixed(2)} pts${Math.abs(factor - 1) >= 0.01 ? `, ${score.toFixed(2)} after matchup and injuries` : ""}`);
  return { score, factor: Math.round(factor * 100) / 100, tier, reasons };
}
