// app/components/TradeOffers.tsx
// Trades tab: offers waiting in Sleeper that involve your team, each graded, with
// counter-offers when an offer isn't good for you.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  useEffect(() => {
    let cancelled = false;
    setError('');
    fetchTradeOffers(leagueId, team.rosterId, team.ownerId)
      .then(d => {
        if (cancelled) return;
        setOffers(d.offers);
        setChecked(d.checked);
      })
      .catch(e => !cancelled && setError(e?.message || 'Could not check for offers'));
    return () => {
      cancelled = true;
    };
  }, [leagueId, team.rosterId, nonce]);

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
          {received.map(o => (
            <View key={o.transactionId} style={{ gap: 6 }}>
              <Text style={styles.from}>Offer from {o.partnerName}</Text>
              <TradeGradeCard r={o.result} partnerName={o.partnerName} onAskAI={onAskAI} />
            </View>
          ))}
          {sent.map(o => (
            <View key={o.transactionId} style={{ gap: 6 }}>
              <Text style={styles.from}>Your offer to {o.partnerName} (waiting on them)</Text>
              <TradeGradeCard r={o.result} partnerName={o.partnerName} onAskAI={onAskAI} />
            </View>
          ))}
        </View>
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
});
