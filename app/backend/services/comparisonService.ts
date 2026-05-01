// app/backend/services/comparisonService.ts
// Generic comparison logic for any players/positions

export interface ComparisonResult {
  statName: string;
  leader: string;
  loser: string;
  leaderValue: number;
  loserValue: number;
  isTied: boolean;
}

/**
 * Compare two players across a list of stat keys
 * Returns formatted comparison strings
 */
export function comparePlayerStats(
  playerA: { name: string; ctx: any },
  playerB: { name: string; ctx: any },
  statConfigs: {
    key: string;
    label: string;
    dataSource?: "last3Summary" | "season"; // Default: season
    higherIsBetter?: boolean;
  }[]
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  for (const config of statConfigs) {
    const source = config.dataSource || "season";

    let valA: number;
    let valB: number;

    if (source === "last3Summary") {
      valA = playerA.ctx.last3Summary?.[config.key] ?? 0;
      valB = playerB.ctx.last3Summary?.[config.key] ?? 0;
    } else {
      valA = playerA.ctx[config.key] ?? 0;
      valB = playerB.ctx[config.key] ?? 0;
    }

    const higherIsBetter = config.higherIsBetter ?? true;
    const isTied = valA === valB;

    let leader = "TIED";
    let loser = "TIED";
    let leaderValue = valA;
    let loserValue = valB;

    if (!isTied) {
      if (higherIsBetter) {
        const aLeads = valA > valB;
        leader = aLeads ? playerA.name : playerB.name;
        loser = aLeads ? playerB.name : playerA.name;
        leaderValue = aLeads ? valA : valB;
        loserValue = aLeads ? valB : valA;
      } else {
        const aLeads = valA < valB;
        leader = aLeads ? playerA.name : playerB.name;
        loser = aLeads ? playerB.name : playerA.name;
        leaderValue = aLeads ? valA : valB;
        loserValue = aLeads ? valB : valA;
      }
    }

    results.push({
      statName: config.label,
      leader,
      loser,
      leaderValue,
      loserValue,
      isTied,
    });
  }

  return results;
}

/**
 * Format comparison results as pre-computed comparison block for AI
 */
export function formatComparisonBlock(
  playerA: { name: string; ctx: any },
  playerB: { name: string; ctx: any },
  comparisons: ComparisonResult[]
): string {
  if (comparisons.length === 0) return "";

  const lines = comparisons.map(comp => {
    if (comp.isTied) {
      return `• ${comp.statName}: TIED (${comp.leaderValue})`;
    }
    const leaderUpper = comp.leader.toUpperCase();
    return `• ${comp.statName}: ${leaderUpper} leads (${comp.leaderValue} vs ${comp.loserValue})`;
  });

  return `
PRE-COMPUTED COMPARISONS (USE THESE EXACTLY — DO NOT RE-CALCULATE):
${lines.join("\n")}
`;
}

/**
 * Determine winner for a stat (for start/sit decisions)
 */
export function getStatLeader(
  playerA: { name: string; value: number },
  playerB: { name: string; value: number }
): "A" | "B" | "TIED" {
  if (playerA.value > playerB.value) return "A";
  if (playerB.value > playerA.value) return "B";
  return "TIED";
}
