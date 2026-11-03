// app/components/DropAlerts.tsx
// Home alert when a player on your team is in today's 25 most-dropped list, with advice.

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFantasy } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { getTrendingPlayers } from '../services/sleeperAPI';
import { buildDropAlerts, dismissDropAlert, loadDismissedDropAlerts, type DropAlert } from '../services/dropAlerts';
import { radius, type Palette } from '../theme';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export default function DropAlerts({ players, onAsk }: { players: Record<string, any>; onAsk: (question: string) => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { myTeam } = useFantasy();
  const [alerts, setAlerts] = useState<DropAlert[]>([]);

  useEffect(() => {
    if (!myTeam) return setAlerts([]);
    let cancelled = false;
    Promise.all([getTrendingPlayers('drop', 25), getTrendingPlayers('add', 10).catch(() => []), loadDismissedDropAlerts()])
      .then(([drops, adds, dismissed]) => {
        if (cancelled) return;
        // Best trending add that isn't already on your team.
        const mine = new Set(myTeam.players.map(p => String(p.playerId)));
        const add = adds.find((a: any) => !mine.has(String(a.player_id)));
        const top = add ? { ...add, ...(players[add.player_id] ?? {}) } : null;
        const list = buildDropAlerts({
          drops,
          myPlayers: myTeam.players,
          reserve: myTeam.reserve,
          topAdd: top?.full_name
            ? { name: top.full_name, position: String(top.position_for_FFHelper || top.position || top.position_listed_on_sleeper || '') }
            : null,
        }).filter(a => !dismissed.includes(a.playerId));
        setAlerts(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [myTeam?.leagueId, myTeam?.players.length, players]);

  if (alerts.length === 0) return null;
  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, gap: 8 }}>
      {alerts.map(a => (
        <View key={a.playerId} style={styles.card}>
          <View style={styles.top}>
            <Ionicons name="trending-down" size={16} color={colors.danger} />
            <Text style={styles.title}>
              {a.name} is #{a.rank} on today's most-dropped list ({fmt(a.drops)} drops)
            </Text>
            <Pressable
              onPress={() => {
                dismissDropAlert(a.playerId);
                setAlerts(list => list.filter(x => x.playerId !== a.playerId));
              }}
              hitSlop={10}
              accessibilityLabel={`Dismiss alert about ${a.name}`}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.body}>{a.advice}</Text>
          <Pressable style={styles.ask} onPress={() => onAsk(a.question)}>
            <Ionicons name="sparkles" size={13} color={colors.primary} />
            <Text style={styles.askText}>Ask AI: should I drop {a.name.split(' ')[0]}?</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  card: { backgroundColor: c.dangerSoft, borderRadius: radius.md, padding: 12, gap: 6 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  title: { flex: 1, fontWeight: '800' as const, color: c.text, fontSize: 14 },
  body: { fontSize: 13, color: c.text, lineHeight: 18 },
  ask: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, alignSelf: 'flex-start' as const },
  askText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
});
