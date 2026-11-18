// app/components/TradeOffers.tsx
// Trades tab: offers waiting in Sleeper that involve your team, each graded, with
// counter-offers when an offer isn't good for you.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../services/firebase';
import { watchExtensionTrades, watchLinkedDevices } from '../services/extensionLink';
import { draftPickLines, offerSourceLabel, type ExtensionTrade } from '../services/extensionTrades';
import { toTransaction } from '../../extension/src/capture';
import type { MyFantasyTeam } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { describeOfferCheck, fetchTradeOffers, type OfferCheck, type PendingOffer } from '../services/tradeGrader';
import TradeGradeCard from './TradeGradeCard';
import { radius, type Palette } from '../theme';

export default function TradeOffers({
  team,
  leagueId,
  onAskAI,
  onGradeByHand,
}: {
  team: MyFantasyTeam;
  leagueId: string;
  onAskAI: (question: string) => void;
  onGradeByHand: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [offers, setOffers] = useState<PendingOffer[] | null>(null);
  const [checked, setChecked] = useState<OfferCheck | undefined>(undefined);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  const navigation = useNavigation<any>();
  // Pending trades the browser extension saved, and whether any browser is linked
  const [extTrades, setExtTrades] = useState<ExtensionTrade[]>([]);
  const [linked, setLinked] = useState<boolean | null>(null);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    const offTrades = watchExtensionTrades(uid, leagueId, setExtTrades);
    const offDevices = watchLinkedDevices(uid, d => setLinked(d.length > 0));
    return () => {
      offTrades();
      offDevices();
    };
  }, [uid, leagueId]);

  // Re-grade when the extension's set of trades changes (not on every "seen" update).
  const extKey = extTrades.map(t => `${t.transactionId}:${t.status}`).sort().join('|');
  const seen = new Map(extTrades.map(t => [t.transactionId, t.seenAt]));

  useEffect(() => {
    let cancelled = false;
    setError('');
    fetchTradeOffers(leagueId, team.rosterId, team.ownerId, extTrades.map(toTransaction))
      .then(d => {
        if (cancelled) return;
        setOffers(d.offers);
        setChecked(d.checked);
      })
      .catch(e => !cancelled && setError(e?.message || 'Could not check for offers'));
    return () => {
      cancelled = true;
    };
  }, [leagueId, team.rosterId, nonce, extKey]);

  const received = (offers ?? []).filter(o => o.direction === 'received');
  const sent = (offers ?? []).filter(o => o.direction === 'sent');

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Ionicons name="mail-unread-outline" size={18} color={colors.primary} />
        <Text style={styles.title}>Trade offers</Text>
        <Pressable onPress={() => setNonce(n => n + 1)} hitSlop={8} accessibilityLabel="Check for new offers">
          <Ionicons name="refresh" size={17} color={colors.primary} />
        </Pressable>
      </View>
      {offers === null && !error ? (
        <ActivityIndicator style={{ padding: 10 }} />
      ) : error ? (
        <Text style={styles.sub}>Couldn't check for offers: {error}</Text>
      ) : received.length + sent.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.sub}>
            No pending offers found for {team.teamName}. Sleeper's public data may not include offers until they're accepted,
            so if you got one,{' '}
            <Text style={styles.link} onPress={onGradeByHand}>grade it by hand</Text> (pick the team and players; it takes a few taps).
          </Text>
          {!!checked && <Text style={styles.checked}>{describeOfferCheck(checked)}</Text>}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {[...received, ...sent].map(o => {
            const label = offerSourceLabel(o, seen, Date.now());
            const picks = draftPickLines(o.draftPicks, team.rosterId);
            return (
              <View key={o.transactionId} style={{ gap: 6 }}>
                <Text style={styles.from}>
                  {o.direction === 'received' ? `Offer from ${o.partnerName}` : `Your offer to ${o.partnerName} (waiting on them)`}
                </Text>
                {!!label && <Text style={styles.source}>{label}</Text>}
                {picks.get.length + picks.give.length > 0 && (
                  <Text style={styles.sub}>
                    {[...picks.get.map(p => `You get: ${p}`), ...picks.give.map(p => `You give: ${p}`)].join(' · ')} (picks aren't graded)
                  </Text>
                )}
                <TradeGradeCard r={o.result} partnerName={o.partnerName} onAskAI={onAskAI} />
              </View>
            );
          })}
        </View>
      )}
      {linked === false && (
        <Pressable style={styles.extCard} onPress={() => navigation.navigate('Extension')} accessibilityRole="button">
          <Ionicons name="extension-puzzle-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.extTitle}>See offers people sent you</Text>
            <Text style={styles.sub}>Get the FF Helper browser extension: it shows your pending Sleeper offers here.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  panel: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: c.border, gap: 8 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '800' as const, color: c.text },
  sub: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
  link: { color: c.primary, fontWeight: '700' as const },
  checked: { fontSize: 11, color: c.textSubtle, lineHeight: 15 },
  from: { fontSize: 13, fontWeight: '800' as const, color: c.text },
  source: { fontSize: 11, fontWeight: '700' as const, color: c.primary },
  extCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: c.primarySoft },
  extTitle: { fontSize: 13, fontWeight: '800' as const, color: c.text },
});
