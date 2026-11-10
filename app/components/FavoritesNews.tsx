// app/components/FavoritesNews.tsx
// Home section: news about the players and teams you follow. "Manage" opens the Following
// screen, where you pick teams and see your players by team / free agents / other teams.

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../AppNavigator';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { favoriteNews, favoriteReason, useFavorites } from '../services/favorites';
import { getNewsFiles, TEAM_NEWS_FILES } from '../services/newsService';
import { fetchArticleImages } from '../services/leagueNews';
import type { NewsItem } from '../services/newsDiversity';
import { radius, type Palette } from '../theme';
import NewsCardRow from './NewsCardRow';

export default function FavoritesNews({ players }: { players: Record<string, any> }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const fav = useFavorites();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    getNewsFiles(TEAM_NEWS_FILES).then(setNews).catch(() => setNews([]));
  }, []);

  const items = useMemo(() => favoriteNews(news, fav, players, 10), [news, fav, players]);
  useEffect(() => {
    if (items.length) fetchArticleImages(items.map(a => ({ link: a.link, player: a.player, image: a.image }))).then(setImages).catch(() => undefined);
  }, [items]);

  const followingCount = fav.players.length + fav.teams.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Your favorites</Text>
          <Text style={styles.sub}>
            {followingCount ? `News about the ${followingCount} players and teams you follow` : 'Follow players and teams to see their news here'}
          </Text>
        </View>
        <Pressable style={styles.editBtn} onPress={() => navigation.navigate('Following')}>
          <Ionicons name={followingCount ? 'list' : 'add'} size={14} color={colors.primary} />
          <Text style={styles.editText}>{followingCount ? 'Manage' : 'Follow'}</Text>
        </Pressable>
      </View>

      {followingCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
          {fav.teams.map(t => (
            <Pressable key={t} style={styles.chip} onPress={() => navigation.navigate('Following')}><Text style={styles.chipText}>★ {t}</Text></Pressable>
          ))}
          {fav.players.map(id => (
            <Pressable key={id} style={styles.chip} onPress={() => navigation.navigate('Following')}><Text style={styles.chipText}>★ {players[id]?.full_name ?? 'Player'}</Text></Pressable>
          ))}
        </ScrollView>
      )}

      {followingCount > 0 &&
        (items.length === 0 ? (
          <Text style={styles.empty}>No recent news about the players and teams you follow.</Text>
        ) : (
          <View style={{ marginTop: 10 }}>
            <NewsCardRow items={items} images={images} extraLabel={a => `${favoriteReason(a, fav, players)} · ${a.player}`} />
          </View>
        ))}

    </View>
  );
}

const makeStyles = (c: Palette) => ({
  wrap: { marginTop: 22 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800' as const, color: c.text },
  sub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  editBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: c.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  editText: { color: c.primary, fontWeight: '700' as const, fontSize: 12 },
  chip: { backgroundColor: c.warningSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: c.warning, fontWeight: '700' as const, fontSize: 12 },
  card: { marginHorizontal: 16, marginTop: 10, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' as const },
  empty: { color: c.textMuted, padding: 16, textAlign: 'center' as const },
  row: { flexDirection: 'row' as const, gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: c.border, alignItems: 'center' as const },
  reason: { fontSize: 11, fontWeight: '800' as const, color: c.warning },
  headline: { fontSize: 14, fontWeight: '700' as const, color: c.text, marginTop: 2 },
  meta: { fontSize: 11, color: c.textMuted, marginTop: 3 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: c.surfaceMuted },
});
