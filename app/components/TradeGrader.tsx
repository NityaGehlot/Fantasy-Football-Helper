// app/components/TradeGrader.tsx
// "Build or grade a trade": pick a team and the players on each side, then either rate a trade
// you'd send (send it, or how to edit it so they say yes) or grade an offer you got in Sleeper
// (accept / counter / decline), with how both starting lineups change.

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MyFantasyTeam } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { fetchLeagueTeams, gradeTradeOffer, type LeagueTeamRoster, type PendingOffer, type TradeGrade } from '../services/tradeGrader';
import TradeGradeCard from './TradeGradeCard';
import type { TradeIdeaPlayer } from '../services/tradeFormat';
import { getPositionColor, radius, shadowFor, type Palette } from '../theme';

const ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const sortPlayers = (list: TradeIdeaPlayer[]) =>
  [...list].sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.value - a.value);

export default function TradeGrader({
  visible,
  team,
  onClose,
  onAskAI,
}: {
  visible: boolean;
  team: MyFantasyTeam;
  onClose: () => void;
  onAskAI: (question: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [teams, setTeams] = useState<LeagueTeamRoster[]>([]);
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<TradeGrade | null>(null);
  // 'send': a trade you're building to propose; 'receive': an offer someone sent you
  const [mode, setMode] = useState<'send' | 'receive'>('send');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError('');
    fetchLeagueTeams(team.leagueId, team.rosterId, team.ownerId)
      .then(d => {
        setTeams(d.teams);
        setOffers(d.offers ?? []);
      })
      .catch(e => setError(e?.message || 'Could not load your league'))
      .finally(() => setLoading(false));
  }, [visible, team.leagueId, team.rosterId]);

  const mine = teams.find(t => t.rosterId === team.rosterId);
  const partner = teams.find(t => t.rosterId === partnerId);
  const others = useMemo(() => teams.filter(t => t.rosterId !== team.rosterId), [teams, team.rosterId]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const close = () => {
    setResult(null);
    setGive([]);
    setGet([]);
    setPartnerId(null);
    onClose();
  };

  const grade = async () => {
    if (partnerId === null) return;
    setGrading(true);
    setError('');
    try {
      setResult(await gradeTradeOffer({ leagueId: team.leagueId, rosterId: team.rosterId, ownerId: team.ownerId, partnerRosterId: partnerId, give, get, mode }));
    } catch (e: any) {
      setError(e?.message || 'Could not grade this trade');
    } finally {
      setGrading(false);
    }
  };

  const PlayerToggle = ({ p, on, onPress }: { p: TradeIdeaPlayer; on: boolean; onPress: () => void }) => (
    <Pressable style={[styles.player, on && styles.playerOn]} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? colors.primary : colors.textSubtle} />
      <View style={[styles.pos, { backgroundColor: getPositionColor(p.position) }]}>
        <Text style={styles.posText}>{p.position}</Text>
      </View>
      <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
      <Text style={styles.playerValue}>{p.value.toFixed(2)}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Build or grade a trade</Text>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator style={{ padding: 30 }} />
          ) : (
            <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 10 }}>
              <View style={styles.modeRow}>
                {([['send', "I'm sending it"], ['receive', 'I got this offer']] as const).map(([m, label]) => (
                  <Pressable key={m} style={[styles.modeBtn, mode === m && styles.modeBtnOn]} onPress={() => { setMode(m); setResult(null); }}>
                    <Text style={[styles.modeText, mode === m && { color: colors.onPrimary }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.sub}>
                {mode === 'send'
                  ? "Build the trade you're thinking of proposing. You'll see whether it helps you, whether they'd likely accept, and edits that get a yes."
                  : 'Enter an offer someone sent you in Sleeper to see whether to accept, counter or decline.'}{' '}
                Numbers are projected points per game.
              </Text>

              {mode === 'receive' && offers.length > 0 && (
                <>
                  <Text style={styles.section}>PENDING OFFERS IN SLEEPER</Text>
                  {offers.map(o => (
                    <View key={o.transactionId}>
                      <Text style={styles.sub}>
                        {o.direction === 'received' ? `From ${o.partnerName}` : `You sent to ${o.partnerName}`}
                      </Text>
                      <TradeGradeCard r={o.result} partnerName={o.partnerName} onAskAI={q => { onAskAI(q); close(); }} />
                    </View>
                  ))}
                </>
              )}


              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {others.map(t => (
                  <Pressable
                    key={t.rosterId}
                    style={[styles.teamChip, partnerId === t.rosterId && styles.teamChipOn]}
                    onPress={() => {
                      setPartnerId(t.rosterId);
                      setGet([]);
                      setResult(null);
                    }}
                  >
                    <Text style={[styles.teamChipText, partnerId === t.rosterId && { color: colors.onPrimary }]} numberOfLines={1}>{t.teamName}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {partner && mine && (
                <>
                  <Text style={styles.section}>YOU GIVE</Text>
                  {sortPlayers(mine.players).map(p => (
                    <PlayerToggle key={p.id} p={p} on={give.includes(p.id)} onPress={() => { toggle(give, setGive, p.id); setResult(null); }} />
                  ))}
                  <Text style={styles.section}>YOU GET FROM {partner.teamName.toUpperCase()}</Text>
                  {sortPlayers(partner.players).map(p => (
                    <PlayerToggle key={p.id} p={p} on={get.includes(p.id)} onPress={() => { toggle(get, setGet, p.id); setResult(null); }} />
                  ))}
                </>
              )}
              {!!error && <Text style={styles.error}>{error}</Text>}
              {result && partner && <TradeGradeCard r={result} partnerName={partner.teamName} onAskAI={q => { onAskAI(q); close(); }} />}
            </ScrollView>
          )}

          {partner && (
            <Pressable
              style={[styles.gradeBtn, (grading || (give.length === 0 && get.length === 0)) && { opacity: 0.5 }]}
              disabled={grading || (give.length === 0 && get.length === 0)}
              onPress={grade}
            >
              {grading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.gradeBtnText}>{mode === 'send' ? 'Rate my trade' : 'Grade this offer'}</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 12 },
  sheet: { width: '100%' as const, maxWidth: 520, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, ...shadowFor(c) },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 6 },
  title: { flex: 1, fontSize: 20, fontWeight: '800' as const, color: c.text },
  section: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8, marginTop: 6 },
  sub: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
  teamChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: c.surfaceMuted, maxWidth: 200 },
  teamChipOn: { backgroundColor: c.primary },
  teamChipText: { fontSize: 13, fontWeight: '700' as const, color: c.text },
  player: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 7, paddingHorizontal: 8, borderRadius: radius.sm },
  playerOn: { backgroundColor: c.primarySoft },
  pos: { width: 36, height: 20, borderRadius: 5, alignItems: 'center' as const, justifyContent: 'center' as const },
  posText: { color: '#fff', fontWeight: '800' as const, fontSize: 10 },
  playerName: { flex: 1, fontSize: 14, fontWeight: '600' as const, color: c.text },
  playerValue: { fontSize: 12, color: c.textMuted, fontWeight: '700' as const },
  error: { color: c.danger, fontSize: 13 },
  gradeBtn: { backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' as const, marginTop: 10 },
  gradeBtnText: { color: c.onPrimary, fontWeight: '800' as const, fontSize: 15 },
  modeRow: { flexDirection: 'row' as const, backgroundColor: c.surfaceMuted, borderRadius: radius.pill, padding: 3, marginTop: 4 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' as const },
  modeBtnOn: { backgroundColor: c.primary },
  modeText: { fontSize: 13, fontWeight: '800' as const, color: c.text },
});
