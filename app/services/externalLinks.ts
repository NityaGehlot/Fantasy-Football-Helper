// app/services/externalLinks.ts
// Links out of the app: Sleeper (to make the moves the app suggests) and X (live posts).
//
// Why links instead of doing it for you: Sleeper's public API is read-only. Changing a lineup or
// sending a trade needs Sleeper's private API and your Sleeper login token, which gives full
// access to your account and could stop working whenever Sleeper changes it, so the app never
// asks for it. X's API can't be read without a paid plan, so the X button opens X's own search.

/** Your league in Sleeper (opens the Sleeper app on a phone where it's installed). */
export const sleeperLeagueUrl = (leagueId: string) => `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}`;

/** Latest posts on X mentioning someone (exact phrase, newest first). */
export const xSearchUrl = (query: string) => `https://x.com/search?q=${encodeURIComponent(`"${query.trim()}"`)}&f=live`;

const TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills', CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys', DEN: 'Denver Broncos',
  DET: 'Detroit Lions', GB: 'Green Bay Packers', HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants', NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SF: 'San Francisco 49ers', SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans', WAS: 'Washington Commanders', WSH: 'Washington Commanders',
};

/** The full team name to search for (falls back to the player's name for free agents). */
export const teamSearchName = (team: string, fallback: string) => TEAM_NAMES[String(team).toUpperCase()] ?? fallback;
