// app/services/newsFallback.ts
// What a news card shows when its article has no picture (or the picture won't load): the team's
// colours and logo when the story is about one player on one team, otherwise a neutral card with
// the source's name. Pure code.

// Primary colour of each NFL team.
export const TEAM_COLORS: Record<string, string> = {
  ARI: '#97233F', ATL: '#A71930', BAL: '#241773', BUF: '#00338D', CAR: '#0085CA', CHI: '#0B162A',
  CIN: '#FB4F14', CLE: '#311D00', DAL: '#003594', DEN: '#FB4F14', DET: '#0076B6', GB: '#203731',
  HOU: '#03202F', IND: '#002C5F', JAX: '#006778', KC: '#E31837', LAC: '#0080C6', LAR: '#003594',
  LV: '#000000', MIA: '#008E97', MIN: '#4F2683', NE: '#002244', NO: '#D3BC8D', NYG: '#0B2265',
  NYJ: '#125740', PHI: '#004C54', PIT: '#FFB612', SEA: '#002244', SF: '#AA0000', TB: '#D50A0A',
  TEN: '#0C2340', WAS: '#5A1414',
};

// Same logo source the player page uses.
export const teamLogoUrl = (team: string) => `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${team}`;

export type NewsFallback =
  | { kind: 'team'; team: string; color: string; logo: string; source: string }
  | { kind: 'neutral'; source: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Player name -> team, from the Sleeper player database (built once per screen). */
export function teamIndex(players: Record<string, any>): Map<string, string> {
  const out = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const p of Object.values(players ?? {})) {
    if (!p?.full_name || !p?.team) continue;
    const key = norm(p.full_name);
    const team = String(p.team).toUpperCase();
    // Two players with the same name on different teams (Josh Allen BUF / JAX): don't guess.
    if (out.has(key) && out.get(key) !== team) ambiguous.add(key);
    out.set(key, team);
  }
  ambiguous.forEach(k => out.delete(k));
  return out;
}

export function fallbackFor(article: { player?: string | null; players?: string[]; source?: string | null }, teams: Map<string, string>): NewsFallback {
  const source = article.source || 'News';
  const names = [...(article.players ?? []), ...(article.player ? [article.player] : [])];
  const found = [...new Set(names.map(n => teams.get(norm(n))).filter((t): t is string => !!t))];
  const team = names.length > 0 && found.length === 1 && names.every(n => teams.has(norm(n))) ? found[0] : null;
  if (!team || !TEAM_COLORS[team]) return { kind: 'neutral', source };
  return { kind: 'team', team, color: TEAM_COLORS[team], logo: teamLogoUrl(team), source };
}
