// app/components/LeagueMovesCard.tsx
// "League activity": the trades and roster moves (waiver claims, free-agent adds and drops)
// the other managers in your league made over the last two weeks, newest first.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { fetchLeagueMoves, MOVE_LABELS, type LeagueMove, type MovePlayer } from '../services/leagueMoves';
import { timeAgo } from '../services/leagueNews';
import { positionColors, radius, type Palette } from '../theme';

type Filter = 'others' | 'trades' | 'all';
const FILTERS: [Filter, string][] = [
  ['others', 'Other teams'],
  ['trades', 'Trades'],
  ['all', 'Everyone'],
];

export default function LeagueMovesCard({ leagueId, rosterId }: { leagueId: string; rosterId?: number | null }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [moves, setMoves] = useState<LeagueMove[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('others');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMoves(null);
    setError('');
    fetchLeagueMoves(leagueId, rosterId)
      .then(m => !cancelled && setMoves(m))
      .catch(e => !cancelled && setError(e?.message || 'League activity unavailable'));
    return () => {
      cancelled = true;
    };
  }, [leagueId, rosterId]);

  const shown = (moves ?? []).filter(m => (filter === 'trades' ? m.type === 'trade' : filter === 'others' ? !m.involvesYou : true));
  const visible = expanded ? shown : shown.slice(0, 4);

  const playerLine = (p: MovePlayer, kind: 'add' | 'drop') => (
    <View key={`${kind}-${p.id}`} style={styles.playerLine}>
      <Ionicons name={kind === 'add' ? 'add-circle' : 'remove-circle'} size={14} color={kind === 'add' ? colors.success : colors.danger} />
      {!!p.position && (
        <View style={[styles.pos, { backgroundColor: positionColors[p.position] ?? colors.textSubtle }]}>
          <Text style={styles.posText}>{p.position}</Text>
        </View>
      )}
      <Text style={styles.playerName} numberOfLines={1}>
        {p.name}
        {p.team && p.position !== 'DEF' ? <Text style={styles.muted}> · {p.team}</Text> : null}
      </Text>
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="newspaper-outline" size={16} color={colors.primary} />
        <Text style={styles.title}>League activity</Text>
        <Text style={styles.sub}>last 2 weeks</Text>
      </View>
      <View style={styles.filters}>
        {FILTERS.map(([key, label]) => (
          <Pressable key={key} style={[styles.chip, filter === key && styles.chipOn]} onPress={() => setFilter(key)}>
            <Text style={[styles.chipText, filter === key && { color: colors.onPrimary }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {moves === null && !error ? (
        <ActivityIndicator style={{ paddingVertical: 14 }} />
      ) : error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : shown.length === 0 ? (
        <Text style={styles.muted}>
          {filter === 'trades' ? 'No trades in the last two weeks.' : 'No roster moves in the last two weeks.'}
        </Text>
      ) : (
        visible.map(m => (
          <View key={m.id} style={styles.move}>
            <View style={styles.moveHead}>
              <View style={[styles.typePill, { backgroundColor: m.type === 'trade' ? colors.primarySoft : colors.surfaceMuted }]}>
                <Ionicons
                  name={m.type === 'trade' ? 'swap-horizontal' : m.type === 'waiver' ? 'hourglass-outline' : 'flash-outline'}
                  size={11}
                  color={m.type === 'trade' ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.typeText, { color: m.type === 'trade' ? colors.primary : colors.textMuted }]}>
                  {MOVE_LABELS[m.type]}
                  {m.bid ? ` · $${m.bid}` : ''}
                </Text>
              </View>
              <Text style={styles.time}>{m.at ? timeAgo(new Date(m.at).toISOString()) : `Week ${m.week}`}</Text>
            </View>
            {m.sides
              .filter(s => s.adds.length || s.drops.length || s.picks.length || s.faab)
              .map(s => (
                <View key={s.rosterId} style={styles.side}>
                  <Text style={styles.team}>
                    {s.teamName}
                    {m.involvesYou && rosterId === s.rosterId ? <Text style={styles.muted}> (you)</Text> : null}
                    {m.type === 'trade' ? <Text style={styles.muted}> gets</Text> : null}
                  </Text>
                  {s.adds.map(p => playerLine(p, 'add'))}
                  {s.picks.map(pk => (
                    <Text key={pk} style={styles.extra}>+ {pk} pick</Text>
                  ))}
                  {!!s.faab && <Text style={styles.extra}>+ ${s.faab} FAAB</Text>}
                  {m.type !== 'trade' && s.drops.map(p => playerLine(p, 'drop'))}
                </View>
              ))}
          </View>
        ))
      )}

      {shown.length > 4 && (
        <Pressable style={styles.more} onPress={() => setExpanded(e => !e)}>
          <Text style={styles.moreText}>{expanded ? 'Show less' : `Show all ${shown.length}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, marginTop: 14, borderWidth: 1, borderColor: c.border, gap: 8 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  title: { flex: 1, fontSize: 16, fontWeight: '800' as const, color: c.text },
  sub: { fontSize: 12, color: c.textMuted },
  filters: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: c.surfaceMuted },
  chipOn: { backgroundColor: c.primary },
  chipText: { fontSize: 12, fontWeight: '700' as const, color: c.text },
  move: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 6 },
  moveHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  typePill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 11, fontWeight: '800' as const },
  time: { fontSize: 11, color: c.textMuted },
  side: { gap: 3 },
  team: { fontSize: 13, fontWeight: '800' as const, color: c.text },
  playerLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingLeft: 2 },
  pos: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, minWidth: 28, alignItems: 'center' as const },
  posText: { color: '#fff', fontSize: 9, fontWeight: '900' as const },
  playerName: { fontSize: 13, color: c.text, flexShrink: 1 },
  extra: { fontSize: 12, color: c.success, paddingLeft: 4, fontWeight: '700' as const },
  muted: { fontSize: 12, color: c.textMuted, fontWeight: '400' as const },
  more: { alignSelf: 'center' as const, paddingVertical: 6 },
  moreText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
});
