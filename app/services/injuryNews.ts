// app/services/injuryNews.ts
// The newest injury or practice headline about a player, so the injury card can show news
// that comes out before the official report (e.g. "not spotted at practice").

import type { NewsItem } from './newsDiversity';

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
const INJURY_TEXT = /injur|practice|not spotted|sidelined|out for|ruled out|questionable|doubtful|ankle|knee|hamstring|concussion|foot|shoulder|groin|calf|return/i;

export function latestInjuryNews(items: NewsItem[], playerName: string, now = Date.now(), maxDays = 5): NewsItem | null {
  const name = norm(playerName);
  if (!name) return null;
  return (
    items
      .filter(a => norm(a.player) === name)
      .filter(a => a.category === 'injury' || a.category === 'injury_return' || INJURY_TEXT.test(a.title))
      .filter(a => {
        const t = Date.parse(String(a.published ?? ''));
        return Number.isFinite(t) && now - t <= maxDays * 86_400_000;
      })
      .sort((a, b) => String(b.published).localeCompare(String(a.published)))[0] ?? null
  );
}
