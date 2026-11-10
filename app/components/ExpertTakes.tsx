// app/components/ExpertTakes.tsx
// "Expert takes" on a player (the News section's third tab): RotoWire's updates, each with what
// the news means for fantasy, and ESPN analysts' columns that discuss him. Newest first; tap a
// take to read all of it, or open the full column.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchPlayerInsights, type PlayerInsight } from '../services/playerInsights';
import { timeAgo } from '../services/leagueNews';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { radius, type Palette } from '../theme';

export default function ExpertTakes({ player, limit = 6 }: { player: any; limit?: number }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [items, setItems] = useState<PlayerInsight[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError('');
    setOpen(null);
    setShowAll(false);
    fetchPlayerInsights(player ?? {})
      .then(r => { if (!cancelled) setItems(r); })
      .catch(e => { if (!cancelled) setError(e?.message || 'Expert takes unavailable'); });
    return () => { cancelled = true; };
  }, [player?.player_id, player?.espn_id]);

  if (error) return <Text style={styles.empty}>Couldn't load expert takes right now.</Text>;
  if (!items) return <ActivityIndicator style={{ padding: 16 }} />;
  if (items.length === 0) return <Text style={styles.empty}>No expert takes on this player yet.</Text>;

  const shown = showAll ? items : items.slice(0, limit);
  return (
    <View style={{ gap: 10 }}>
      {shown.map(item => {
        const expanded = open === item.id;
        return (
          <Pressable key={item.id} style={styles.card} onPress={() => setOpen(expanded ? null : item.id)}>
            <View style={styles.metaRow}>
              <View style={[styles.badge, item.kind === 'update' ? styles.badgeUpdate : styles.badgeArticle]}>
                <Text style={styles.badgeText}>{item.kind === 'update' ? 'UPDATE' : 'ANALYSIS'}</Text>
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {item.author ? `${item.author} · ` : ''}{item.source}{item.published ? ` · ${timeAgo(item.published)}` : ''}
              </Text>
            </View>
            <Text style={styles.headline}>{item.headline}</Text>
            {!!item.analysis && (
              <Text style={styles.analysis} numberOfLines={expanded ? undefined : 3}>
                {item.analysis}
              </Text>
            )}
            {expanded && !!item.link && (
              <Pressable style={styles.linkRow} onPress={() => Linking.openURL(item.link!).catch(() => undefined)} hitSlop={6}>
                <Text style={styles.link}>Read the full {item.kind === 'update' ? 'story' : 'column'}{item.premium ? ' (ESPN+)' : ''}</Text>
                <Ionicons name="open-outline" size={13} color={colors.primary} />
              </Pressable>
            )}
          </Pressable>
        );
      })}
      {items.length > limit && (
        <Pressable onPress={() => setShowAll(!showAll)} style={styles.moreBtn}>
          <Text style={styles.link}>{showAll ? 'Show fewer' : `Show ${items.length - limit} more`}</Text>
        </Pressable>
      )}
      <Text style={styles.credit}>Updates by RotoWire and analysis by ESPN's fantasy writers.</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  empty: { fontSize: 14, color: c.textMuted, paddingVertical: 8 },
  card: { backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 12, gap: 6 },
  metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeUpdate: { backgroundColor: c.primary },
  badgeArticle: { backgroundColor: c.success },
  badgeText: { fontSize: 10, fontWeight: '800' as const, color: c.onPrimary, letterSpacing: 0.5 },
  meta: { flex: 1, fontSize: 12, color: c.textMuted },
  headline: { fontSize: 14, fontWeight: '700' as const, color: c.text, lineHeight: 19 },
  analysis: { fontSize: 13, color: c.text, lineHeight: 19, opacity: 0.9 },
  linkRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '700' as const, color: c.primary },
  moreBtn: { alignItems: 'center' as const, paddingVertical: 4 },
  credit: { fontSize: 11, color: c.textSubtle },
});
