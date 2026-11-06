// app/components/NewsCardRow.tsx
// A horizontal row of news cards in the same style as "Around the League" on Home: cover
// image (the article's own picture), a colored label (good / bad news), headline, summary
// and source. Used for "Your favorites" on Home and for news on player pages.

import React from 'react';
import { Image, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { isVideoArticle } from '../services/newsDiversity';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { timeAgo } from '../services/leagueNews';
import type { NewsItem } from '../services/newsDiversity';
import { radius, shadowFor, type Palette } from '../theme';

type Tone = { label: string; icon: keyof typeof Ionicons.glyphMap; color: string };

/** Label and color for a player-news article, from its impact and category. */
export function newsTone(a: NewsItem, colors: { success: string; danger: string; warning: string; primary: string; textMuted: string }): Tone {
  const impact = String(a.impact ?? '').toLowerCase();
  const category = String(a.category ?? '').toLowerCase();
  if (impact === 'negative') return { label: category === 'injury' ? 'Injury' : 'Bad news', icon: 'medkit', color: colors.danger };
  if (impact === 'slightly_negative') return { label: category === 'injury' ? 'Injury watch' : 'Monitor', icon: 'alert-circle', color: colors.warning };
  if (impact === 'positive') return { label: category === 'injury_return' ? 'Returning' : 'Good news', icon: 'trending-up', color: colors.success };
  if (impact === 'roster_move' || category === 'transaction') return { label: 'Roster move', icon: 'swap-horizontal', color: colors.primary };
  return { label: category === 'fantasy_advice' ? 'Fantasy advice' : 'News', icon: 'newspaper-outline', color: colors.textMuted };
}

export default function NewsCardRow({
  items,
  images = {},
  extraLabel,
}: {
  items: NewsItem[];
  // link -> cover image found by the app (used when the article has none of its own)
  images?: Record<string, string | null>;
  // Small text above the headline, e.g. why it's in your favorites
  extraLabel?: (a: NewsItem) => string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards} decelerationRate="fast" snapToInterval={252}>
      {items.map((a, i) => {
        const tone = newsTone(a, colors);
        const image = a.image || (a.link ? images[a.link] : null);
        const href = a.url || a.link;
        const video = isVideoArticle(a);
        return (
          <TouchableOpacity
            key={`${a.link ?? a.title}-${i}`}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => href && Linking.openURL(href).catch(() => undefined)}
          >
            {image ? (
              <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={[styles.image, styles.placeholder, { backgroundColor: `${tone.color}22` }]}>
                <Ionicons name={video ? 'videocam' : tone.icon} size={32} color={tone.color} />
              </View>
            )}
            {/* Videos: a play button over the cover, so it's clear the link opens a video */}
            {video && (
              <View style={styles.play} pointerEvents="none" accessibilityLabel="Video">
                <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 3 }} />
              </View>
            )}
            <View style={[styles.pill, { backgroundColor: tone.color }]}>
              <Ionicons name={tone.icon} size={11} color="#fff" />
              <Text style={styles.pillText}>{tone.label}</Text>
            </View>
            <View style={styles.body}>
              {!!extraLabel && <Text style={styles.extra} numberOfLines={1}>{extraLabel(a)}</Text>}
              <Text style={styles.headline} numberOfLines={3}>{a.title}</Text>
              {!!a.summary && <Text style={styles.summary} numberOfLines={2}>{a.summary}</Text>}
              <Text style={styles.meta} numberOfLines={1}>
                {[a.source, a.published ? timeAgo(a.published) : ''].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  cards: { gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  card: { width: 240, backgroundColor: c.surface, borderRadius: radius.lg, overflow: 'hidden' as const, borderWidth: 1, borderColor: c.border, ...shadowFor(c) },
  image: { width: '100%' as const, height: 128, backgroundColor: c.surfaceMuted },
  placeholder: { alignItems: 'center' as const, justifyContent: 'center' as const },
  play: {
    position: 'absolute' as const,
    top: 64 - 22,
    left: '50%' as const,
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  pill: { position: 'absolute' as const, top: 10, left: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '800' as const },
  body: { padding: 12, gap: 4 },
  extra: { fontSize: 11, fontWeight: '800' as const, color: c.warning },
  headline: { fontSize: 14, fontWeight: '800' as const, color: c.text, lineHeight: 19 },
  summary: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
  meta: { fontSize: 11, color: c.textSubtle, marginTop: 2 },
});
