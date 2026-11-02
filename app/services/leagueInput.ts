// app/services/leagueInput.ts
// Reading a Sleeper league ID from whatever the user pastes (the bare number or a full link).

// Steps for finding the ID on sleeper.com (the app doesn't show it anywhere easy to copy).
export const LEAGUE_ID_STEPS = [
  'Go to sleeper.com on a computer or phone browser and log in.',
  'Click Leagues and open the league you want.',
  'Look at the web address. It looks like sleeper.com/leagues/1262118513326182400/team.',
  'Copy the long number after /leagues/ and paste it here. Pasting the whole link works too.',
];

/**
 * Returns the league ID from a pasted ID or Sleeper link, or null if there isn't one.
 * Accepts "1262118513326182400", "sleeper.com/leagues/1262118513326182400/team",
 * "https://sleeper.com/leagues/1262118513326182400/matchup" and "sleeper.app/leagues/…".
 */
export function parseLeagueId(input: string): string | null {
  const text = String(input ?? '').trim();
  if (!text) return null;
  const fromLink = text.match(/leagues?\/(\d{6,})/i);
  if (fromLink) return fromLink[1];
  const bare = text.replace(/[\s,]/g, '');
  return /^\d{6,}$/.test(bare) ? bare : null;
}

// Pick the league to open: the last one used if it's still in the list, otherwise the first.
export function pickStartingLeague(leagueIds: string[], ...preferred: (string | null | undefined)[]): string | null {
  for (const id of preferred) if (id && leagueIds.includes(id)) return id;
  return leagueIds[0] ?? null;
}
