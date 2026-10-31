// app/screens/TradeIdeasScreen.tsx
// Trade agent inbox: trade ideas that improve your lineup without hurting your partner's.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFantasy } from '../context/FantasyContext';
import { proposeTradeInSleeper, tradeSteps } from '../services/sleeperTrade';
import type { TradeIdea, TradeIdeaPlayer } from '../services/tradeAgent';
import { colors, radius, shadow, getPositionColor } from '../theme';

const formatTime = (iso: string | null) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

function PlayerChip({ player }: { player: TradeIdeaPlayer }) {
  const injured = player.injuryStatus && player.injuryStatus !== 'ACTIVE';
  return (
    <View style={styles.chip}>
      <View style={[styles.posDot, { backgroundColor: getPositionColor(player.position) }]}>
        <Text style={styles.posDotText}>{player.position}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.chipName} numberOfLines={1}>{player.name}</Text>
        <Text style={styles.chipMeta}>
          {player.team || 'FA'} · {player.value.toFixed(1)} pts/g{injured ? ` · ${player.injuryStatus}` : ''}
        </Text>
      </View>
    </View>
  );
}

function TradeCard({ idea, leagueId, isNew }: { idea: TradeIdea; leagueId: string; isNew: boolean }) {
  const navigation = useNavigation<any>();
  const { sendChatMessage } = useFantasy();
  const [expanded, setExpanded] = useState(false);
  const [handoff, setHandoff] = useState<string | null>(null);

  const askAI = () => {
    const give = idea.give.map(p => p.name).join(' and ');
    const get = idea.get.map(p => p.name).join(' and ');
    sendChatMessage(`Should I trade ${give} for ${get}?`);
    navigation.navigate('ChatBot');
  };

  const propose = async () => {
    const result = await proposeTradeInSleeper(leagueId, idea);
    setExpanded(true);
    setHandoff(
      result === 'copied'
        ? 'Trade message copied. Sleeper is opening — follow the steps below.'
        : result === 'shared'
        ? 'Message shared. Sleeper is opening — follow the steps below.'
        : 'Sleeper is opening — follow the steps below.'
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.partner}>with {idea.partner.teamName}</Text>
        {isNew && <Text style={styles.newBadge}>NEW</Text>}
      </View>

      <View style={styles.sides}>
        <View style={styles.side}>
          <Text style={styles.sideLabel}>YOU GIVE</Text>
          {idea.give.map(p => <PlayerChip key={p.id} player={p} />)}
        </View>
        <Ionicons name="swap-horizontal" size={22} color={colors.textMuted} style={{ alignSelf: 'center' }} />
        <View style={styles.side}>
          <Text style={styles.sideLabel}>YOU GET</Text>
          {idea.get.map(p => <PlayerChip key={p.id} player={p} />)}
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={[styles.metric, { backgroundColor: colors.successSoft }]}>
          <Text style={[styles.metricValue, { color: colors.success }]}>+{idea.myGain.toFixed(1)}</Text>
          <Text style={styles.metricLabel}>your pts/week</Text>
        </View>
        <View style={[styles.metric, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.metricValue, { color: colors.primary }]}>
            {idea.theirGain >= 0 ? '+' : ''}{idea.theirGain.toFixed(1)}
          </Text>
          <Text style={styles.metricLabel}>their pts/week</Text>
        </View>
        <View style={[styles.metric, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={styles.metricValue}>{Math.round(idea.fairness * 100)}%</Text>
          <Text style={styles.metricLabel}>value balance</Text>
        </View>
      </View>

      <TouchableOpacity onPress={() => setExpanded(e => !e)} style={styles.whyToggle}>
        <Text style={styles.whyToggleText}>{expanded ? 'Hide details' : 'Why this trade?'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.details}>
          {idea.reasons.map((r, i) => (
            <Text key={i} style={styles.reason}>• {r}</Text>
          ))}
          {handoff && <Text style={styles.handoff}>{handoff}</Text>}
          <Text style={styles.stepsTitle}>How to send it in Sleeper</Text>
          {tradeSteps(idea).map((s, i) => (
            <Text key={i} style={styles.reason}>{i + 1}. {s}</Text>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={propose}>
          <Ionicons name="paper-plane" size={15} color="#fff" />
          <Text style={styles.actionPrimaryText}>Propose in Sleeper</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={askAI}>
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} />
          <Text style={styles.actionSecondaryText}>Ask AI</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TradeIdeasScreen() {
  const {
    myTeam,
    tradeIdeas,
    tradeScanAt,
    isTradeScanning,
    tradeScanError,
    refreshTradeIdeas,
    markTradeIdeasSeen,
    unreadTradeIdeas,
  } = useFantasy();

  // Remember which ideas were new when the screen opened, then mark them seen.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  useFocusEffect(
    React.useCallback(() => {
      if (unreadTradeIdeas > 0) {
        setNewIds(new Set(tradeIdeas.map(i => i.id)));
        markTradeIdeasSeen();
      }
    }, [unreadTradeIdeas, tradeIdeas])
  );

  if (!myTeam) {
    return (
      <View style={styles.empty}>
        <Ionicons name="swap-horizontal" size={42} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Set your team to get trade ideas</Text>
        <Text style={styles.emptyText}>
          Go to the Fantasy tab, select your team, and tap "Set Viewed Team As My Team". The trade agent will then
          scan your league automatically.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Trade Agent</Text>
          <Text style={styles.subtitle}>
            Scans {myTeam.teamName}'s league for trades that make your starting lineup better without making your
            partner's worse. Rescans automatically every 6 hours.
          </Text>
          <Text style={styles.lastScan}>Last scan: {formatTime(tradeScanAt)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.scanBtn, isTradeScanning && { opacity: 0.6 }]}
          onPress={() => refreshTradeIdeas(true)}
          disabled={isTradeScanning}
        >
          {isTradeScanning ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="refresh" size={18} color="#fff" />}
          <Text style={styles.scanBtnText}>{isTradeScanning ? 'Scanning' : 'Scan now'}</Text>
        </TouchableOpacity>
      </View>

      {tradeScanError && (
        <Text style={styles.error}>⚠️ {tradeScanError}. Make sure the backend is running, then tap Scan now.</Text>
      )}

      {!isTradeScanning && tradeIdeas.length === 0 && !tradeScanError && (
        <Text style={styles.emptyText}>
          No win-win trades right now. Your lineup may already be well balanced — check back after the next scan.
        </Text>
      )}

      {tradeIdeas.map(idea => (
        <TradeCard key={idea.id} idea={idea} leagueId={myTeam.leagueId} isNew={newIds.has(idea.id)} />
      ))}

      <Text style={styles.footnote}>
        Values are projected PPR points per game from this season's stats, adjusted for injuries. Sleeper doesn't
        allow apps to submit trades, so "Propose in Sleeper" copies a message and opens your league for you.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginBottom: 14, ...shadow },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  lastScan: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  scanBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  error: { color: colors.danger, marginBottom: 12, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 14, ...shadow },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  partner: { fontSize: 15, fontWeight: '700', color: colors.text },
  newBadge: { backgroundColor: colors.danger, color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  sides: { flexDirection: 'row', gap: 8 },
  side: { flex: 1, gap: 6 },
  sideLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 8 },
  posDot: { width: 34, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  posDotText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  chipName: { fontSize: 14, fontWeight: '700', color: colors.text },
  chipMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 12 },
  metric: { flex: 1, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' },
  metricValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  metricLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  whyToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  whyToggleText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  details: { marginTop: 8, gap: 4 },
  reason: { fontSize: 13, color: colors.text, lineHeight: 19 },
  handoff: { fontSize: 13, color: colors.success, fontWeight: '700', marginTop: 6 },
  stepsTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, paddingVertical: 10 },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionSecondary: { backgroundColor: colors.primarySoft },
  actionSecondaryText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, backgroundColor: colors.background },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginVertical: 12 },
  footnote: { fontSize: 11, color: colors.textMuted, marginTop: 8, lineHeight: 16 },
});
