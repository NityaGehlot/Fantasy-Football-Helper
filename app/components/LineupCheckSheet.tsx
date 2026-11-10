// app/components/LineupCheckSheet.tsx
// Lineup check: the lineup you have set in Sleeper vs the best one for this week (points
// already adjusted for matchups, weather, injuries and inactive players), and the swaps to make.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { sleeperLeagueUrl } from '../services/externalLinks';
import { Ionicons } from '@expo/vector-icons';
import type { MyFantasyTeam } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { fetchLineupCheck, keyReason, shownPoints, SLEEPER_SWAP_STEPS, type LineupCheck } from '../services/lineupCheck';
import { radius, shadowFor, type Palette } from '../theme';

export default function LineupCheckSheet({
  visible,
  team,
  leagueId,
  onClose,
  onAskAI,
}: {
  visible: boolean;
  team: MyFantasyTeam;
  // The league's current-season id (team.leagueId may be an older season you're viewing)
  leagueId: string;
  onClose: () => void;
  onAskAI: (question: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [check, setCheck] = useState<LineupCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError('');
    fetchLineupCheck(leagueId, team.rosterId, team.ownerId)
      .then(setCheck)
      .catch(e => setError(e?.message || 'Lineup check failed'))
      .finally(() => setLoading(false));
  }, [visible, leagueId, team.rosterId]);

  const gain = check ? Math.round((check.bestPoints - check.currentPoints) * 100) / 100 : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation?.()}>
          <View style={styles.header}>
            <Ionicons name="clipboard" size={18} color={colors.primary} />
            <Text style={styles.title}>Lineup check{check ? ` · week ${check.week}` : ''}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator style={{ padding: 30 }} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : check ? (
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10 }}>
              <View style={styles.totals}>
                <View style={styles.total}>
                  <Text style={styles.totalValue}>{check.currentPoints.toFixed(2)}</Text>
                  <Text style={styles.totalLabel}>Your lineup now</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={colors.textMuted} />
                <View style={styles.total}>
                  <Text style={[styles.totalValue, { color: gain > 0 ? colors.success : colors.text }]}>{check.bestPoints.toFixed(2)}</Text>
                  <Text style={styles.totalLabel}>Best lineup</Text>
                </View>
              </View>
              <Text style={styles.note}>
                Every number is Sleeper's projection in your league's scoring, the same as in the Sleeper app.
                When two players are projected about the same, the defense they face, injuries around them and
                weather decide (see each reason). Players whose game already started are locked.
              </Text>

              {check.swaps.length === 0 ? (
                <View style={styles.ok}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={styles.okText}>Your lineup is already the best one for this week.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.section}>MAKE THESE SWAPS (+{gain.toFixed(2)} PROJECTED PTS)</Text>
                  {check.swaps.map((s, i) => (
                    <View key={i} style={styles.swap}>
                      <Text style={styles.slot}>{s.slot}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.start}>
                          <Ionicons name="arrow-up" size={13} color={colors.success} /> {s.from ? `Move ${s.start.name} here from ${s.from}` : `Start ${s.start.name}`} ({s.start.position}, {shownPoints(s.start)})
                        </Text>
                        {s.bench ? (
                          <Text style={styles.bench}>
                            <Ionicons name={s.movesTo ? 'swap-vertical' : 'arrow-down'} size={13} color={s.movesTo ? colors.primary : colors.danger} />{' '}
                            {s.movesTo ? `${s.bench.name} moves to ${s.movesTo}` : `Bench ${s.bench.name}`} ({s.bench.position}, {shownPoints(s.bench)})
                            {s.bench.injuryStatus && s.bench.injuryStatus !== 'ACTIVE' ? ` · ${s.bench.injuryStatus}` : ''}
                          </Text>
                        ) : (
                          <Text style={[styles.bench, { color: colors.danger }]}>Fills your empty {s.slot} spot (it scores 0 right now)</Text>
                        )}
                        {!!keyReason(s.start) && <Text style={styles.reason}>{keyReason(s.start)}</Text>}
                        {!!s.bench && !!keyReason(s.bench) && <Text style={styles.reason}>{s.bench.name}: {keyReason(s.bench)}</Text>}
                      </View>
                      {/* Moves between slots are part of a chain; only real gains get a number. */}
                      {s.movesTo || s.from ? (
                        <Text style={[styles.gain, { color: colors.primary }]}>move</Text>
                      ) : (
                        <Text style={styles.gain}>+{s.gain.toFixed(2)}</Text>
                      )}
                    </View>
                  ))}
                  <Text style={styles.section}>HOW TO DO IT IN SLEEPER</Text>
                  {SLEEPER_SWAP_STEPS.map((step, i) => (
                    <Text key={i} style={styles.step}>{i + 1}. {step}</Text>
                  ))}
                  <Pressable style={styles.sleeperBtn} onPress={() => Linking.openURL(sleeperLeagueUrl(leagueId)).catch(() => undefined)}>
                    <Ionicons name="open-outline" size={14} color={colors.onPrimary} />
                    <Text style={styles.sleeperBtnText}>Open your league in Sleeper</Text>
                  </Pressable>
                </>
              )}

              {(check.closeCalls ?? []).length > 0 && (
                <>
                  <Text style={styles.section}>CLOSE CALLS</Text>
                  {check.closeCalls!.map(c => (
                    <Text key={`${c.slot}-${c.bench.id}`} style={styles.step}>
                      {c.slot}: {c.starter.name} ({shownPoints(c.starter)}) over {c.bench.name} ({shownPoints(c.bench)}), {c.diff.toFixed(2)} apart
                      {keyReason(c.bench) ? ` · ${keyReason(c.bench)}` : ''}
                    </Text>
                  ))}
                </>
              )}

              {check.problems.map((p, i) => (
                <Text key={i} style={styles.problem}>• {p}</Text>
              ))}

              <Pressable
                style={styles.askBtn}
                onPress={() => {
                  onAskAI('Who should I start this week?');
                  onClose();
                }}
              >
                <Ionicons name="sparkles" size={14} color={colors.primary} />
                <Text style={styles.askText}>Ask the AI to explain these picks</Text>
              </Pressable>
            </ScrollView>
          ) : null}
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
  error: { color: c.danger, padding: 12 },
  totals: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-around' as const, backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 12 },
  total: { alignItems: 'center' as const },
  totalValue: { fontSize: 24, fontWeight: '800' as const, color: c.text },
  totalLabel: { fontSize: 11, color: c.textMuted },
  note: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
  ok: { flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const, backgroundColor: c.successSoft, borderRadius: radius.md, padding: 12 },
  okText: { flex: 1, color: c.text, fontWeight: '600' as const },
  section: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8, marginTop: 4 },
  swap: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 10 },
  slot: { width: 46, fontWeight: '800' as const, color: c.textMuted, fontSize: 12 },
  start: { fontSize: 14, fontWeight: '700' as const, color: c.text },
  bench: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  reason: { fontSize: 12, color: c.textMuted, marginTop: 3, fontStyle: 'italic' as const, lineHeight: 16 },
  gain: { fontWeight: '800' as const, color: c.success },
  step: { fontSize: 13, color: c.text, lineHeight: 18 },
  sleeperBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 10, marginTop: 4 },
  sleeperBtnText: { color: c.onPrimary, fontWeight: '800' as const, fontSize: 13 },
  problem: { fontSize: 13, color: c.danger, lineHeight: 18 },
  askBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: 6 },
  askText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
});
