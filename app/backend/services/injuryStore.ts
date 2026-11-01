// app/backend/services/injuryStore.ts
// Current injury designations from nfl-data (data/injuries/injuries_current.json), cached.
// Used for weeks that don't have a stats file yet, so the chatbot doesn't report
// "ACTIVE / Full practice" for a player who is actually on IR.

import fetch from "node-fetch";
import { createTtlCache, MINUTE } from "../utils/ttlCache";
import { normalizePlayerName, normalizePosition } from "../utils/names";

const INJURY_URL = "https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/injuries/injuries_current.json";
const cache = createTtlCache();

export type InjuryRecord = {
  player_id: string;
  full_name: string;
  team: string;
  position: string;
  status: string;
  game_status?: string;
  practice_status?: string;
  injury?: string;
};

let byName = new Map<string, InjuryRecord>();
let byTeam = new Map<string, InjuryRecord[]>();

const key = (name: string, position: string) => `${normalizePosition(position)}|${normalizePlayerName(name)}`;

export function setInjuryRecords(records: InjuryRecord[]) {
  byName = new Map(records.map(r => [key(r.full_name, r.position), r]));
  byTeam = new Map();
  for (const r of records) {
    const team = String(r.team).toUpperCase();
    byTeam.set(team, [...(byTeam.get(team) ?? []), r]);
  }
}

/** Load (or refresh) the injury file. Never throws: missing data just means no overrides. */
export async function ensureInjuriesLoaded(): Promise<void> {
  try {
    const records = await cache.get("injuries", 30 * MINUTE, async () => {
      const res = await fetch(INJURY_URL);
      if (!res.ok) throw new Error(`Injury file unavailable (${res.status})`);
      const data = (await res.json()) as { players?: InjuryRecord[] };
      return Array.isArray(data.players) ? data.players : [];
    });
    setInjuryRecords(records);
  } catch {
    // keep whatever we had
  }
}

export const lookupInjury = (name: string, position: string): InjuryRecord | null =>
  byName.get(key(name, position)) ?? null;

export const injuriesForTeam = (team: string): InjuryRecord[] => byTeam.get(String(team).toUpperCase()) ?? [];

const PRACTICE: Record<string, string> = { DNP: "Did not practice", LP: "Limited", FP: "Full" };
export const practiceLabel = (code?: string) => (code ? PRACTICE[code] ?? code : "");
