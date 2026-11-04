// app/screens/TradeIdeasScreen.tsx
// Trade agent inbox: trade ideas that improve your lineup without hurting your partner's.

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Linking, Platform, Share,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFantasy } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  buildTradeMessage, sleeperLeagueUrl, summarizeIdea, tradeSteps, TRADE_METRIC_HELP, TRADE_SCREEN_GUIDE,
  type TradeIdea, type TradeIdeaPlayer,
} from '../services/tradeFormat';
import { radius, shadowFor, getPositionColor, type Palette } from '../theme';
import TradeGrader from '../components/TradeGrader';
import TradeOffers from '../components/TradeOffers';

const GUIDE_DISMISSED_KEY = 'ffh_trade_guide_dismissed_v1';

const formatTime = (iso: string | null) => {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

function PlayerChip({ player }: { player: TradeIdeaPlayer }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const injured = player.injuryStatus && player.injuryStatus !== 'ACTIVE';
  return (
    <View style={styles.chip}>
      <View style={[styles.posDot, { backgroundColor: getPositionColor(player.position) }]}>
        <Text style={styles.posDotText}>{player.position}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.chipName} numberOfLines={1}>{player.name}</Text>
        <Text style={styles.chipMeta}>
          {player.team || 'FA'} · {player.value.toFixed(1)} pts/g
          {injured ? <Text style={styles.injured}>{` · ${player.injuryStatus}`}</Text> : null}
        </Text>
        {player.playoff && player.playoff.label !== 'unknown' && (
          <Text
            style={[styles.chipMeta, { color: player.playoff.label === 'easy' ? colors.success : player.playoff.label === 'tough' ? colors.danger : colors.textMuted }]}
            numberOfLines={1}
          >
            Playoffs: {player.playoff.label} schedule
          </Text>
        )}
      </View>
    </View>
  );
}

// A number with an (i) that reveals what it means.
function Metric({
  label, value, tone, help, open, onToggle,
}: {
  label: string; value: string; tone: 'success' | 'primary' | 'neutral' | 'danger'; help: string; open: boolean; onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const bg = { success: colors.successSoft, primary: colors.primarySoft, neutral: colors.surfaceMuted, danger: colors.dangerSoft }[tone];
  const fg = { success: colors.success, primary: colors.primary, neutral: colors.text, danger: colors.danger }[tone];
  return (
    <TouchableOpacity style={[styles.metric, { backgroundColor: bg }]} onPress={onToggle} activeOpacity={0.8} accessibilityHint={help}>
      <Text style={[styles.metricValue, { color: fg }]}>{value}</Text>
      <View style={styles.metricLabelRow}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Ionicons name={open ? 'information-circle' : 'information-circle-outline'} size={13} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function ProposeSheet({ idea, leagueId, onClose }: { idea: TradeIdea; leagueId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [message, setMessage] = useState(buildTradeMessage(idea));
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      const clipboard = (globalThis as any)?.navigator?.clipboard;
      if (Platform.OS === 'web' && clipboard?.writeText) {
        await clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        await Share.share({ message });
      }
    } catch {
      // user dismissed the share sheet
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Send this trade in Sleeper</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 6 }}>
            <Text style={styles.sectionLabel}>1. SUGGESTED MESSAGE</Text>
            <Text style={styles.sheetHint}>
              Sleeper trade offers don't include a note, so send this as a direct message after proposing. Edit it however you like.
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              style={styles.messageInput}
              placeholderTextColor={colors.textSubtle}
            />
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary, { alignSelf: 'flex-start', paddingHorizontal: 14 }]} onPress={copy}>
              <Ionicons name={copied ? 'checkmark' : Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} size={15} color={colors.primary} />
              <Text style={styles.actionSecondaryText}>{copied ? 'Copied!' : Platform.OS === 'web' ? 'Copy message' : 'Share message'}</Text>
            </TouchableOpacity>

            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>2. PROPOSE IT IN SLEEPER</Text>
            {tradeSteps(idea).map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionPrimary, { marginTop: 12 }]}
            onPress={() => Linking.openURL(sleeperLeagueUrl(leagueId)).catch(() => undefined)}
          >
            <Ionicons name="open-outline" size={16} color={colors.onPrimary} />
            <Text style={styles.actionPrimaryText}>Open league in Sleeper</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function TradeCard({ idea, leagueId, isNew }: { idea: TradeIdea; leagueId: string; isNew: boolean }) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { sendChatMessage } = useFantasy();
  const [expanded, setExpanded] = useState(false);
  const [help, setHelp] = useState<keyof typeof TRADE_METRIC_HELP | null>(null);
  const [proposing, setProposing] = useState(false);

  const askAI = () => {
    const give = idea.give.map(p => p.name).join(' and ');
    const get = idea.get.map(p => p.name).join(' and ');
    sendChatMessage(`Should I trade ${give} for ${get}?`);
    navigation.navigate('ChatBot');
  };

  const toggleHelp = (key: keyof typeof TRADE_METRIC_HELP) => setHelp(h => (h === key ? null : key));

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.partnerLabel}>TRADE WITH</Text>
          <Text style={styles.partner} numberOfLines={1}>{idea.partner.teamName}</Text>
        </View>
        {isNew && <Text style={styles.newBadge}>NEW</Text>}
      </View>

      <Text style={styles.summary}>{summarizeIdea(idea)}</Text>

      <View style={styles.sides}>
        <View style={styles.side}>
          <Text style={[styles.sideLabel, { color: colors.danger }]}>YOU GIVE</Text>
          {idea.give.map(p => <PlayerChip key={p.id} player={p} />)}
        </View>
        <Ionicons name="swap-horizontal" size={20} color={colors.textSubtle} style={{ alignSelf: 'center' }} />
        <View style={styles.side}>
          <Text style={[styles.sideLabel, { color: colors.success }]}>YOU GET</Text>
          {idea.get.map(p => <PlayerChip key={p.id} player={p} />)}
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="Your lineup / wk" value={signed(idea.myGain)} tone="success" help={TRADE_METRIC_HELP.myGain} open={help === 'myGain'} onToggle={() => toggleHelp('myGain')} />
        <Metric label="Their lineup / wk" value={signed(idea.theirGain)} tone={idea.theirGain >= 0 ? 'primary' : 'danger'} help={TRADE_METRIC_HELP.theirGain} open={help === 'theirGain'} onToggle={() => toggleHelp('theirGain')} />
        <Metric label="Fairness" value={`${Math.round(idea.fairness * 100)}%`} tone="neutral" help={TRADE_METRIC_HELP.fairness} open={help === 'fairness'} onToggle={() => toggleHelp('fairness')} />
      </View>
      {help && <Text style={styles.helpText}>{TRADE_METRIC_HELP[help]}</Text>}

      <TouchableOpacity onPress={() => setExpanded(e => !e)} style={styles.whyToggle}>
        <Text style={styles.whyToggleText}>{expanded ? 'Hide lineup details' : 'See lineup details'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.details}>
          {idea.reasons.map((r, i) => (
            <Text key={i} style={styles.reason}>• {r}</Text>
          ))}
          <Text style={styles.valueNote}>pts/g = {TRADE_METRIC_HELP.value}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => setProposing(true)}>
          <Ionicons name="paper-plane" size={15} color={colors.onPrimary} />
          <Text style={styles.actionPrimaryText}>Propose in Sleeper</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={askAI}>
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} />
          <Text style={styles.actionSecondaryText}>Ask AI</Text>
        </TouchableOpacity>
      </View>

      {proposing && <ProposeSheet idea={idea} leagueId={leagueId} onClose={() => setProposing(false)} />}
    </View>
  );
}

function Untouchables() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { myTeam, untouchablePlayerIds, toggleUntouchable } = useFantasy();
  const [open, setOpen] = useState(false);
  if (!myTeam) return null;

  const order = ['QB', 'RB', 'WR', 'TE'];
  const tradeable = myTeam.players
    .filter(p => order.includes(p.position))
    .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position) || a.fullName.localeCompare(b.fullName));
  const lockedCount = untouchablePlayerIds.length;

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.panelHeader} onPress={() => setOpen(o => !o)}>
        <Ionicons name="lock-closed" size={16} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Untouchable players</Text>
          <Text style={styles.panelSub}>
            {lockedCount ? `${lockedCount} locked — never included in trade ideas` : 'Lock players you never want to trade'}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={styles.lockGrid}>
          {tradeable.map(p => {
            const locked = untouchablePlayerIds.includes(String(p.playerId));
            return (
              <TouchableOpacity
                key={p.playerId}
                style={[styles.lockChip, locked && styles.lockChipOn]}
                onPress={() => toggleUntouchable(String(p.playerId))}
                accessibilityRole="switch"
                accessibilityState={{ checked: locked }}
              >
                <Ionicons name={locked ? 'lock-closed' : 'lock-open-outline'} size={13} color={locked ? colors.onPrimary : colors.textMuted} />
                <Text style={[styles.lockChipText, locked && { color: colors.onPrimary }]} numberOfLines={1}>
                  {p.fullName} <Text style={{ opacity: 0.7 }}>{p.position}</Text>
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function TradeIdeasScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const {
    myTeam, tradeIdeas, tradeScanAt, isTradeScanning, tradeScanError, refreshTradeIdeas, markTradeIdeasSeen, unreadTradeIdeas,
  } = useFantasy();
  const [showGuide, setShowGuide] = useState(false);
  const [showGrader, setShowGrader] = useState(false);
  const navigation = useNavigation<any>();
  const { sendChatMessage, activeLeagueId } = useFantasy();

  useEffect(() => {
    AsyncStorage.getItem(GUIDE_DISMISSED_KEY).then(v => setShowGuide(v !== '1')).catch(() => setShowGuide(true));
  }, []);
  const dismissGuide = () => {
    setShowGuide(false);
    AsyncStorage.setItem(GUIDE_DISMISSED_KEY, '1').catch(() => undefined);
  };

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.title}>Trade Agent</Text>
            <TouchableOpacity onPress={() => setShowGuide(g => !g)} accessibilityLabel="How to read this screen">
              <Ionicons name="help-circle-outline" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Win-win trade ideas for {myTeam.teamName}. Scans automatically every 6 hours.
          </Text>
          <Text style={styles.lastScan}>Last scan: {formatTime(tradeScanAt)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.scanBtn, isTradeScanning && { opacity: 0.6 }]}
          onPress={() => refreshTradeIdeas(true)}
          disabled={isTradeScanning}
        >
          {isTradeScanning ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Ionicons name="refresh" size={16} color={colors.onPrimary} />}
          <Text style={styles.scanBtnText}>{isTradeScanning ? 'Scanning' : 'Scan now'}</Text>
        </TouchableOpacity>
      </View>

      {showGuide && (
        <View style={styles.guide}>
          <View style={styles.guideHeader}>
            <Ionicons name="bulb-outline" size={16} color={colors.primary} />
            <Text style={styles.guideTitle}>How to read this screen</Text>
            <TouchableOpacity onPress={dismissGuide} accessibilityLabel="Dismiss guide">
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {TRADE_SCREEN_GUIDE.map((line, i) => (
            <Text key={i} style={styles.guideLine}>• {line}</Text>
          ))}
          <Text style={styles.guideLine}>• Tap any number (or its ⓘ) to see what it means.</Text>
        </View>
      )}

      {activeLeagueId && (
        <TradeOffers
          team={myTeam}
          leagueId={activeLeagueId}
          onGradeByHand={() => setShowGrader(true)}
          onAskAI={q => {
            sendChatMessage(q);
            navigation.navigate('MainTabs', { screen: 'ChatBot' });
          }}
        />
      )}

      <TouchableOpacity style={styles.graderBtn} onPress={() => setShowGrader(true)}>
        <Ionicons name="construct-outline" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Build or grade a trade</Text>
          <Text style={styles.panelSub}>
            Build a trade and the AI tells you whether to send it or how to change it. Got an offer? Grade it here too.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      <TradeGrader
        visible={showGrader}
        team={myTeam}
        onClose={() => setShowGrader(false)}
        onAskAI={q => {
          sendChatMessage(q);
          navigation.navigate('MainTabs', { screen: 'ChatBot' });
        }}
      />

      <Untouchables />

      {tradeScanError && (
        <Text style={styles.error}>⚠️ {tradeScanError}. Make sure the backend is running, then tap Scan now.</Text>
      )}

      {!isTradeScanning && tradeIdeas.length === 0 && !tradeScanError && (
        <Text style={styles.emptyText}>
          No win-win trades right now. Your lineup may already be well balanced, or try unlocking a player. Check back after the next scan.
        </Text>
      )}

      {tradeIdeas.map(idea => (
        <TradeCard key={idea.id} idea={idea} leagueId={myTeam.leagueId} isNew={newIds.has(idea.id)} />
      ))}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  container: { flex: 1, backgroundColor: c.background },
  graderBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: c.border },
  hero: { flexDirection: 'row' as const, gap: 12, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, marginBottom: 12, ...shadowFor(c) },
  title: { fontSize: 22, fontWeight: '800' as const, color: c.text },
  subtitle: { fontSize: 13, color: c.textMuted, marginTop: 4, lineHeight: 18 },
  lastScan: { fontSize: 12, color: c.textSubtle, marginTop: 8 },
  scanBtn: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: c.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  scanBtnText: { color: c.onPrimary, fontWeight: '700' as const, fontSize: 13 },
  guide: { backgroundColor: c.primarySoft, borderRadius: radius.lg, padding: 14, marginBottom: 12, gap: 4 },
  guideHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 4 },
  guideTitle: { flex: 1, fontWeight: '800' as const, color: c.text, fontSize: 14 },
  guideLine: { color: c.text, fontSize: 13, lineHeight: 19 },
  panel: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: c.border },
  panelHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  panelTitle: { fontWeight: '800' as const, color: c.text, fontSize: 14 },
  panelSub: { color: c.textMuted, fontSize: 12, marginTop: 1 },
  lockGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 12 },
  lockChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' as const },
  lockChipOn: { backgroundColor: c.primary, borderColor: c.primary },
  lockChipText: { color: c.text, fontSize: 12, fontWeight: '600' as const },
  error: { color: c.danger, marginBottom: 12, fontSize: 13 },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: c.border, ...shadowFor(c) },
  cardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 6 },
  partnerLabel: { fontSize: 10, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8 },
  partner: { fontSize: 16, fontWeight: '800' as const, color: c.text },
  newBadge: { backgroundColor: c.danger, color: '#fff', fontSize: 10, fontWeight: '800' as const, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' as const },
  summary: { fontSize: 13, color: c.textMuted, lineHeight: 19, marginBottom: 12 },
  sides: { flexDirection: 'row' as const, gap: 8 },
  side: { flex: 1, gap: 6 },
  sideLabel: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.6 },
  chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 8 },
  posDot: { width: 34, height: 22, borderRadius: 6, alignItems: 'center' as const, justifyContent: 'center' as const },
  posDotText: { color: '#fff', fontWeight: '800' as const, fontSize: 11 },
  chipName: { fontSize: 14, fontWeight: '700' as const, color: c.text },
  chipMeta: { fontSize: 11, color: c.textMuted, marginTop: 1 },
  injured: { color: c.danger, fontWeight: '700' as const },
  metrics: { flexDirection: 'row' as const, gap: 8, marginTop: 12 },
  metric: { flex: 1, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' as const },
  metricValue: { fontSize: 17, fontWeight: '800' as const },
  metricLabelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, marginTop: 2 },
  metricLabel: { fontSize: 11, color: c.textMuted },
  helpText: { fontSize: 12, color: c.text, backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 10, marginTop: 8, lineHeight: 17 },
  whyToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 12 },
  whyToggleText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  details: { marginTop: 8, gap: 4 },
  reason: { fontSize: 13, color: c.text, lineHeight: 19 },
  valueNote: { fontSize: 11, color: c.textSubtle, marginTop: 6, lineHeight: 16 },
  actions: { flexDirection: 'row' as const, gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, borderRadius: radius.md, paddingVertical: 10 },
  actionPrimary: { backgroundColor: c.primary },
  actionPrimaryText: { color: c.onPrimary, fontWeight: '700' as const, fontSize: 13 },
  actionSecondary: { backgroundColor: c.primarySoft },
  actionSecondaryText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  empty: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32, gap: 10, backgroundColor: c.background },
  emptyTitle: { fontSize: 18, fontWeight: '800' as const, color: c.text, textAlign: 'center' as const },
  emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center' as const, lineHeight: 20, marginVertical: 12 },
  sheetBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 480, backgroundColor: c.surface, borderRadius: radius.lg, padding: 18, ...shadowFor(c) },
  sheetHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800' as const, color: c.text },
  sectionLabel: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8, marginBottom: 6 },
  sheetHint: { fontSize: 12, color: c.textMuted, lineHeight: 17, marginBottom: 8 },
  messageInput: { minHeight: 110, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 10, color: c.text, backgroundColor: c.surfaceMuted, fontSize: 14, lineHeight: 20, textAlignVertical: 'top' as const, marginBottom: 10 },
  stepRow: { flexDirection: 'row' as const, gap: 10, marginBottom: 10, alignItems: 'flex-start' as const },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  stepNumText: { color: c.primary, fontWeight: '800' as const, fontSize: 12 },
  stepText: { flex: 1, color: c.text, fontSize: 13, lineHeight: 19 },
});
