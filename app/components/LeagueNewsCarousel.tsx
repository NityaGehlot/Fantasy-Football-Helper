// app/components/LeagueNewsCarousel.tsx
// Horizontally scrolling "Around the League" cards: trades, injuries, returns, signings.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLeagueNews, timeAgo, type LeagueNewsArticle, type LeagueNewsCategory } from '../services/leagueNews';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { radius, shadowFor, type Palette } from '../theme';

const FILTERS: { key: string; label: string; categories: LeagueNewsCategory[] | null }[] = [
  { key: 'all', label: 'Top stories', categories: null },
  { key: 'injury', label: 'Injuries', categories: ['injury', 'suspension'] },
  { key: 'return', label: 'Returning', categories: ['return'] },
  { key: 'moves', label: 'Trades & moves', categories: ['trade', 'signing', 'release'] },
];

const CATEGORY_STYLE: Record<LeagueNewsCategory, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  trade: { icon: 'swap-horizontal', color: '#7c3aed' },
  signing: { icon: 'create-outline', color: '#2563eb' },
  release: { icon: 'exit-outline', color: '#64748b' },
  injury: { icon: 'medkit', color: '#dc2626' },
  return: { icon: 'fitness', color: '#16a34a' },
  suspension: { icon: 'ban', color: '#b45309' },
  other: { icon: 'newspaper-outline', color: '#475569' },
};

export default function LeagueNewsCarousel() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [articles, setArticles] = useState<LeagueNewsArticle[] | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    getLeagueNews()
      .then(a => !cancelled && setArticles(a))
      .catch(() => !cancelled && setArticles([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const cats = FILTERS.find(f => f.key === filter)?.categories;
    return (articles ?? []).filter(a => !cats || cats.includes(a.category));
  }, [articles, filter]);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Around the League</Text>
        <Ionicons name="flash" size={16} color={colors.warning} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[styles.filter, filter === f.key && styles.filterOn]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.filterText, filter === f.key && styles.filterTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {articles === null ? (
        <View style={styles.loading}><ActivityIndicator /></View>
      ) : visible.length === 0 ? (
        <Text style={styles.empty}>No {filter === 'all' ? '' : 'matching '}news right now.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards} decelerationRate="fast" snapToInterval={272}>
          {visible.map(a => {
            const cat = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE.other;
            return (
              <TouchableOpacity
                key={a.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => a.link && Linking.openURL(a.link).catch(() => undefined)}
              >
                {a.image ? (
                  <Image source={{ uri: a.image }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: `${cat.color}22` }]}>
                    <Ionicons name={cat.icon} size={34} color={cat.color} />
                  </View>
                )}
                <View style={[styles.pill, { backgroundColor: cat.color }]}>
                  <Ionicons name={cat.icon} size={11} color="#fff" />
                  <Text style={styles.pillText}>{a.label}</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.headline} numberOfLines={3}>{a.headline}</Text>
                  {!!a.description && <Text style={styles.description} numberOfLines={2}>{a.description}</Text>}
                  <Text style={styles.meta}>{timeAgo(a.published)}{a.players.length ? ` · ${a.players.slice(0, 2).join(', ')}` : ''}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  section: { marginTop: 18 },
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: '800' as const, color: c.text },
  filters: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  filterOn: { backgroundColor: c.text, borderColor: c.text },
  filterText: { fontSize: 12, fontWeight: '700' as const, color: c.textMuted },
  filterTextOn: { color: c.background },
  loading: { height: 120, alignItems: 'center' as const, justifyContent: 'center' as const },
  empty: { color: c.textMuted, paddingHorizontal: 16, paddingVertical: 20 },
  cards: { gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  card: { width: 260, backgroundColor: c.surface, borderRadius: radius.lg, overflow: 'hidden' as const, borderWidth: 1, borderColor: c.border, ...shadowFor(c) },
  image: { width: '100%' as const, height: 140, backgroundColor: c.surfaceMuted },
  imagePlaceholder: { alignItems: 'center' as const, justifyContent: 'center' as const },
  pill: { position: 'absolute' as const, top: 10, left: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '800' as const },
  body: { padding: 12, gap: 4 },
  headline: { fontSize: 15, fontWeight: '800' as const, color: c.text, lineHeight: 20 },
  description: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
  meta: { fontSize: 11, color: c.textSubtle, marginTop: 2 },
});
