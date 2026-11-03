// app/services/dropAlerts.ts
// When one of your players is among the most dropped players today, say so and suggest what
// to do. Each alert can be dismissed (it stays dismissed for that player for 3 days).

import AsyncStorage from '@react-native-async-storage/async-storage';

export type DropAlert = {
  playerId: string;
  name: string;
  position: string;
  rank: number; // 1 = most dropped
  drops: number;
  isStarter: boolean;
  advice: string;
  question: string; // for the AI assistant
};

export function buildDropAlerts({
  drops,
  myPlayers,
  topAdd,
  reserve = [],
}: {
  drops: { player_id: string; count: number }[];
  myPlayers: { playerId: string; fullName: string; position: string; isStarter: boolean }[];
  topAdd?: { name: string; position: string } | null;
  // Players in your IR spots (they don't take a roster spot)
  reserve?: string[];
}): DropAlert[] {
  const mine = new Map(myPlayers.map(p => [String(p.playerId), p]));
  return drops
    .slice(0, 25)
    .map((d, i) => ({ d, i, p: mine.get(String(d.player_id)) }))
    .filter(x => !!x.p)
    .map(({ d, i, p }) => {
      const onIr = reserve.map(String).includes(String(d.player_id));
      const advice = onIr
        ? `He's in your IR spot, so he isn't using a roster spot. Keep him unless his injury ends his season, then drop him to free the IR spot.`
        : p!.isStarter
        ? `He's still in your starting lineup, so don't panic-drop him. Check the news for why managers are cutting him, and line up a backup.`
        : topAdd && topAdd.name !== p!.fullName
          ? `He's on your bench. If he isn't helping your lineup, swapping him for a trending pickup like ${topAdd.name}${topAdd.position ? ` (${topAdd.position})` : ''} is worth a look.`
          : `He's on your bench. If he isn't helping your lineup, he's a good candidate to drop for a waiver pickup.`;
      return {
        playerId: String(d.player_id),
        name: p!.fullName,
        position: p!.position,
        rank: i + 1,
        drops: Number(d.count) || 0,
        isStarter: p!.isStarter,
        advice,
        question: `${p!.fullName} is one of the most dropped players today. Should I drop him, and who should I pick up instead?`,
      };
    });
}

const DISMISS_KEY = 'ffh_drop_alerts_dismissed_v1';
const DISMISS_MS = 3 * 24 * 3600 * 1000;

export async function loadDismissedDropAlerts(now = Date.now()): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    return Object.entries(map).filter(([, t]) => now - t < DISMISS_MS).map(([id]) => id);
  } catch {
    return [];
  }
}

export async function dismissDropAlert(playerId: string, now = Date.now()) {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[playerId] = now;
    await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}
