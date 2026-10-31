// app/backend/utils/names.ts
// Name helpers so Sleeper players can be matched to nfl-data stat rows (which use GSIS ids).

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function normalizePlayerName(name: unknown): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.'’`-]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(part => part && !SUFFIXES.has(part))
    .join(" ");
}

export function normalizeTeam(team: unknown): string {
  const normalized = String(team ?? "").trim().toUpperCase();
  const aliases: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR" };
  return aliases[normalized] ?? normalized;
}

export function normalizePosition(position: unknown): string {
  const pos = String(position ?? "").trim().toUpperCase();
  if (pos === "PK") return "K";
  if (pos === "DST" || pos === "D/ST") return "DEF";
  return pos;
}

// Key used to join Sleeper players and stat rows.
export function playerKey(name: unknown, position: unknown, team?: unknown): string {
  const pos = normalizePosition(position);
  if (pos === "DEF") return `DEF|${normalizeTeam(team ?? name)}`;
  return `${pos}|${normalizePlayerName(name)}`;
}
