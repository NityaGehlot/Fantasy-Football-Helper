// app/components/LiveScoreboard.tsx
// Head-to-head scoreboard card: live points, projected finals and win probability.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LiveScoreboard as Board, LiveSide } from '../services/liveMatchup';
import { radius, shadowFor, type Palette } from '../theme';
import { useTheme, useLooseThemedStyles } from '../context/ThemeContext';

const pct = (p: number) => `${Math.round(p * 100)}%`;

function Side({ side, align }: { side: LiveSide; align: 'left' | 'right' }) {
  const styles = useLooseThemedStyles(makeStyles);
  const textAlign = align;
  return (
    <View style={{ flex: 1, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
      <Text style={[styles.teamName, { textAlign }]} numberOfLines={1}>{side.teamName}</Text>
      <Text style={styles.score}>{side.points.toFixed(2)}</Text>
      <Text style={[styles.projected, { textAlign }]}>Proj {side.projectedFinal.toFixed(1)}</Text>
      <Text style={[styles.status, { textAlign }]}>
        {side.playersInProgress > 0 ? `${side.playersInProgress} playing · ` : ''}
        {side.playersYetToPlay} yet to play
      </Text>
    </View>
  );
}

export default function LiveScoreboard({
  board,
  loading,
  error,
  onRefresh,
}: {
  board: Board | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const { colors } = useTheme();
  const styles = useLooseThemedStyles(makeStyles);

  if (!board) {
    return (
      <View style={[styles.card, styles.center]}>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.muted}>{error ? 'Live scoreboard unavailable right now.' : 'No matchup this week.'}</Text>
        )}
      </View>
    );
  }

  const me = board.me;
  const opp = board.opponent;
  const myWin = opp ? me.winProbability : 1;
  const label = board.isLive ? 'LIVE' : board.isFinal ? 'FINAL' : 'PROJECTED';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.badge, board.isLive ? styles.badgeLive : styles.badgeIdle]}>
          {board.isLive && <View style={styles.liveDot} />}
          <Text style={[styles.badgeText, board.isLive && { color: '#fff' }]}>{label} · WEEK {board.week}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => setShowHelp(h => !h)} accessibilityLabel="How win odds work">
            <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh} disabled={loading} accessibilityLabel="Refresh live scores">
            {loading ? <ActivityIndicator size="small" /> : <Ionicons name="refresh" size={18} color={colors.primary} />}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sidesRow}>
        <Side side={me} align="left" />
        <Text style={styles.vs}>vs</Text>
        {opp ? <Side side={opp} align="right" /> : <View style={{ flex: 1 }} />}
      </View>

      {opp && (
        <View style={{ marginTop: 12 }}>
          <View style={styles.oddsLabels}>
            <Text style={[styles.oddsText, { color: colors.primary }]}>{pct(myWin)} to win</Text>
            <Text style={[styles.oddsText, { color: colors.danger }]}>{pct(1 - myWin)}</Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { flex: Math.max(myWin, 0.001) }]} />
            <View style={[styles.barRest, { flex: Math.max(1 - myWin, 0.001) }]} />
          </View>
        </View>
      )}

      {showHelp && (
        <Text style={styles.help}>
          Projected = points scored so far + each starter's projection for the part of his game still left.
          Win odds compare both projections and how much they could still swing (more players yet to play = more
          uncertainty). Updates every minute while games are on.
        </Text>
      )}
      {!board.scheduleKnown && (
        <Text style={styles.help}>Game clocks unavailable — projections assume points so far are part of each player's projection.</Text>
      )}
      <Text style={styles.updated}>Updated {new Date(board.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => ({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginTop: 12, borderWidth: 1, borderColor: colors.border, ...shadowFor(colors) },
  center: { alignItems: 'center', justifyContent: 'center', minHeight: 70 },
  muted: { color: colors.textMuted, fontSize: 13 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeLive: { backgroundColor: colors.danger },
  badgeIdle: { backgroundColor: colors.surfaceMuted },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  sidesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vs: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  teamName: { fontSize: 14, fontWeight: '700', color: colors.text, maxWidth: '100%' },
  score: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 2 },
  projected: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  status: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  oddsLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  oddsText: { fontSize: 12, fontWeight: '800' },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { backgroundColor: colors.primary },
  barRest: { backgroundColor: colors.dangerSoft },
  help: { fontSize: 12, color: colors.textMuted, marginTop: 10, lineHeight: 17 },
  updated: { fontSize: 11, color: colors.textMuted, marginTop: 8, textAlign: 'right' },
});
