// app/components/TradeForSheet.tsx
// "Trade for him": a ready-to-send offer for a player on another team in your league, with
// how both lineups change, the message to send, and the steps in Sleeper.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MyFantasyTeam } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { fetchTradeFor } from '../services/tradeGrader';
import { buildTradeMessage, sleeperLeagueUrl, tradeSteps, type TradeIdea } from '../services/tradeFormat';
import { radius, shadowFor, type Palette } from '../theme';

export default function TradeForSheet({
  visible,
  team,
  leagueId,
  player,
  onClose,
}: {
  visible: boolean;
  team: MyFantasyTeam;
  leagueId: string;
  player: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [ideas, setIdeas] = useState<TradeIdea[] | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !player) return;
    setIdeas(null);
    setPick(0);
    setError('');
    fetchTradeFor(leagueId, team.rosterId, team.ownerId, player.id)
      .then(d => {
        setOwner(d.owner);
        setIdeas(d.ideas ?? []);
      })
      .catch(e => setError(e?.message || 'Could not build a trade'));
  }, [visible, player?.id, leagueId]);

  const idea = ideas?.[pick];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation?.()}>
          <View style={styles.header}>
            <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
            <Text style={styles.title} numberOfLines={2}>Trade for {player?.name}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : ideas === null ? (
            <ActivityIndicator style={{ padding: 24 }} />
          ) : !idea ? (
            <Text style={styles.sub}>
              {owner ? `Couldn't find a fair offer to ${owner} for him from your roster right now.` : "He isn't on a team in your league."}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10 }}>
              <Text style={styles.sub}>He's on {owner}. {ideas.length > 1 ? 'Pick an offer:' : 'Suggested offer:'}</Text>
              {ideas.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {ideas.map((_, i) => (
                    <Pressable key={i} style={[styles.tab, pick === i && styles.tabOn]} onPress={() => setPick(i)}>
                      <Text style={[styles.tabText, pick === i && { color: colors.onPrimary }]}>Offer {i + 1}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.card}>
                <Text style={styles.line}>You give <Text style={styles.bold}>{idea.give.map(p => `${p.name} (${p.position})`).join(', ')}</Text></Text>
                <Text style={styles.line}>You get <Text style={styles.bold}>{idea.get.map(p => `${p.name} (${p.position})`).join(', ')}</Text></Text>
                <Text style={styles.line}>
                  Your lineup{' '}
                  <Text style={{ color: idea.myGain >= 0 ? colors.success : colors.danger, fontWeight: '800' }}>
                    {idea.myGain >= 0 ? '+' : ''}{idea.myGain.toFixed(1)} pts/wk
                  </Text>
                  {' · '}their lineup {idea.theirGain >= 0 ? '+' : ''}{idea.theirGain.toFixed(1)} · value balance {Math.round(idea.fairness * 100)}%
                </Text>
                {idea.myGain < 0 && (
                  <Text style={[styles.line, { color: colors.warning }]}>
                    This costs your current lineup a little: it's worth it only if you want him for depth, injuries or the playoffs.
                  </Text>
                )}
              </View>
              <Text style={styles.section}>MESSAGE TO SEND (TAP AND HOLD TO COPY)</Text>
              <Text style={styles.message} selectable>{buildTradeMessage(idea)}</Text>
              <Text style={styles.section}>HOW TO PROPOSE IT IN SLEEPER</Text>
              {tradeSteps(idea).map((s, i) => (
                <Text key={i} style={styles.line}>{i + 1}. {s}</Text>
              ))}
              <Pressable style={styles.open} onPress={() => Linking.openURL(sleeperLeagueUrl(leagueId)).catch(() => undefined)}>
                <Text style={styles.openText}>Open my league in Sleeper</Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: Palette) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 480, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, ...shadowFor(c) },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 10 },
  title: { flex: 1, fontSize: 19, fontWeight: '800' as const, color: c.text },
  sub: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
  error: { color: c.danger },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceMuted },
  tabOn: { backgroundColor: c.primary },
  tabText: { fontWeight: '700' as const, fontSize: 12, color: c.text },
  card: { backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 12, gap: 4 },
  line: { fontSize: 13, color: c.text, lineHeight: 19 },
  bold: { fontWeight: '800' as const },
  section: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8 },
  message: { fontSize: 13, color: c.text, backgroundColor: c.surfaceMuted, borderRadius: radius.sm, padding: 10, lineHeight: 19 },
  open: { backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' as const, marginTop: 4 },
  openText: { color: c.onPrimary, fontWeight: '800' as const },
});
