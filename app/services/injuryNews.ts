// app/services/injuryNews.ts
// The newest injury or practice headline about a player, so the injury card can show news
// that comes out before the official report (e.g. "not spotted at practice").

import type { NewsItem } from './newsDiversity';

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
// Headlines that are about HIS injury or practice status. Words like "injuries" alone aren't
// enough ("...a career day when injuries mounted" is a game story, not an injury update).
export const INJURY_HEADLINE =
  /ruled out|\b(is|listed|remains?|as|considered)\s+(questionable|doubtful|out)\b|questionable|doubtful|week-to-week|day-to-day|game-time decision|injured reserve|\b(placed|lands?|landed|heads?|goes?) on (ir|injured reserve)\b|\bto ir\b|off (ir|injured reserve)|activated|designated to return|did not practice|didn't practice|\bdnp\b|(limited|full|no|not) (in )?practice|practice (in full|fully|limited)|(out of|absent from|miss(es|ed)?|sits? out|held out of|returns? to|back at) practice|not spotted|sidelined|(suffer|sustain|aggravat|tweak)\w* (an? |his )?\w*\s?(injury|sprain|strain|tear|fracture|concussion)|(ankle|knee|hamstring|groin|calf|foot|shoulder|back|neck|hip|quad|wrist|hand|toe|rib|chest|elbow|achilles|acl|mcl|oblique)\s+(injury|sprain|strain|tear|issue|soreness|surgery)|concussion|surgery|\bmri\b|x-rays?|carted off|left (the )?game|won't return|will not return|out for (the )?(season|year|game|week|\d)|expected to (miss|return|play)|(update|news) on .* injury|injury update|\((ankle|knee|hamstring|groin|calf|foot|shoulder|back|neck|hip|quad|wrist|hand|toe|ribs?|chest|elbow|achilles|concussion|illness|thumb|finger|pectoral|abdomen|heel|shin|personal)[^)]*\)/i;

const lastName = (name: string) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\.?$/g, '')
    .replace(/[^a-z' -]/g, '')
    .trim()
    .split(/\s+/)
    .pop() ?? '';

/**
 * Is this headline an update on HIS injury? The injury words have to be in the same part of the
 * headline as his name: in "Jeremiah Love placed on IR, Tyler Allgeier becomes RB1" the injury
 * is Love's, so it isn't an Allgeier injury update. Headlines that don't name him at all count
 * only when the article itself is filed as injury news.
 */
export function isInjuryHeadline(a: { title?: string; category?: string; player?: string }): boolean {
  const title = String(a.title ?? '');
  const filedAsInjury = a.category === 'injury' || a.category === 'injury_return';
  const last = lastName(a.player ?? '');
  if (!last || !title.toLowerCase().includes(last)) return filedAsInjury;
  const clauses = title.split(/[,;:|–—]|\s-\s|\band\b|\bwhile\b/i);
  const own = clauses.some(c => c.toLowerCase().includes(last) && INJURY_HEADLINE.test(c));
  // Filed as injury news and naming him, with no injury words about anyone else.
  return own || (filedAsInjury && !INJURY_HEADLINE.test(title));
}

export function latestInjuryNews(items: NewsItem[], playerName: string, now = Date.now(), maxDays = 5): NewsItem | null {
  const name = norm(playerName);
  if (!name) return null;
  return (
    items
      .filter(a => norm(a.player) === name)
      .filter(isInjuryHeadline)
      .filter(a => {
        const t = Date.parse(String(a.published ?? ''));
        return Number.isFinite(t) && now - t <= maxDays * 86_400_000;
      })
      .sort((a, b) => String(b.published).localeCompare(String(a.published)))[0] ?? null
  );
}
