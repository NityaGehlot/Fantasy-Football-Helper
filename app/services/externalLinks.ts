// app/services/externalLinks.ts
// Links out of the app to Sleeper, to make the moves the app suggests.
//
// Why a link instead of doing it for you: Sleeper's public API is read-only. Changing a lineup or
// sending a trade needs Sleeper's private API and your Sleeper login token, which gives full
// access to your account and could stop working whenever Sleeper changes it, so the app never
// asks for it.

/** Your league in Sleeper (opens the Sleeper app on a phone where it's installed). */
export const sleeperLeagueUrl = (leagueId: string) => `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}`;
