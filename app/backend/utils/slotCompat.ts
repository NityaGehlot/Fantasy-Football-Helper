// app/backend/utils/slotCompat.ts
// Can two players take each other's lineup spot in this league? (e.g. a QB and a WR can't,
// unless the league has a SUPER FLEX spot.)

import { parseRosterSlots, SLOT_ELIGIBILITY, SlotName } from "../services/lineup";

export function slotsFor(position: string, rosterPositions?: string[] | null): SlotName[] {
  const pos = String(position).toUpperCase();
  return [...new Set(parseRosterSlots(rosterPositions ?? undefined).filter(s => SLOT_ELIGIBILITY[s].includes(pos)))];
}

export function sharedSlots(a: string, b: string, rosterPositions?: string[] | null): SlotName[] {
  const bs = new Set(slotsFor(b, rosterPositions));
  return slotsFor(a, rosterPositions).filter(s => bs.has(s));
}

/**
 * Reply for "start A or B?" when A and B can't play the same spot, listing who each one can be
 * compared with on your roster. Null when the comparison is fine.
 */
export function incompatibleStartSitReply(
  a: { name: string; position: string },
  b: { name: string; position: string },
  rosterPositions?: string[] | null,
  roster: { fullName: string; position: string }[] = []
): string | null {
  if (sharedSlots(a.position, b.position, rosterPositions).length > 0) return null;
  // Names from the stats files are lowercase: use your roster's spelling, or capitalize.
  const pretty = (name: string) =>
    roster.find(r => r.fullName.toLowerCase() === name.toLowerCase())?.fullName ??
    name.replace(/(^|[\s'-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
  a = { ...a, name: pretty(a.name) };
  b = { ...b, name: pretty(b.name) };
  const options = (p: { name: string; position: string }) => {
    const mySlots = new Set(slotsFor(p.position, rosterPositions));
    return roster
      .filter(r => r.fullName.toLowerCase() !== p.name.toLowerCase() && slotsFor(r.position, rosterPositions).some(s => mySlots.has(s)))
      .map(r => `${r.fullName} (${r.position})`)
      .slice(0, 6);
  };
  const where = (p: { position: string }) => slotsFor(p.position, rosterPositions).join(" or ") || "no starting spot";
  const lines = [
    `⚠️ ${a.name} (${a.position}) and ${b.name} (${b.position}) can't take each other's spot in your lineup: a ${a.position} plays ${where(a)}, and a ${b.position} plays ${where(b)}. So starting one never means benching the other.`,
  ];
  const oa = options(a);
  const ob = options(b);
  if (oa.length) lines.push(`• Compare ${a.name} with: ${oa.join(", ")}.`);
  if (ob.length) lines.push(`• Compare ${b.name} with: ${ob.join(", ")}.`);
  lines.push('Tip: the "Start or sit?" button only shows players who can swap with each other.');
  return lines.join("\n");
}
