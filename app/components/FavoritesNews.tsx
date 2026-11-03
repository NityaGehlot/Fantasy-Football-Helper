// app/components/FavoritesNews.tsx
// Home section: news about the players and teams you follow, plus a sheet to pick teams.

import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { favoriteNews, favoriteReason, toggleFavoritePlayer, toggleFavoriteTeam, useFavorites } from '../services/favorites';
import { getNewsFiles, TEAM_NEWS_FILES } from '../services/newsService';
import { fetchArticleImages, timeAgo } from '../services/leagueNews';
import { NFL_TEAMS } from '../services/playerStatus';
import type { NewsItem } from '../services/newsDiversity';
import { radius, type Palette } from '../theme';

export default function FavoritesNews({ players }: { players: Record<string, any> }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const fav = useFavorites();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState(false);

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
        <Pressable style={styles.editBtn} onPress={() => setEditing(true)}>
          <Ionicons name={followingCount ? 'create-outline' : 'add'} size={14} color={colors.primary} />
          <Text style={styles.editText}>{followingCount ? 'Edit' : 'Follow'}</Text>
        </Pressable>
      </View>

      {followingCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
          {fav.teams.map(t => (
            <View key={t} style={styles.chip}><Text style={styles.chipText}>★ {t}</Text></View>
          ))}
          {fav.players.map(id => (
            <View key={id} style={styles.chip}><Text style={styles.chipText}>★ {players[id]?.full_name ?? 'Player'}</Text></View>
          ))}
        </ScrollView>
      )}

      {followingCount > 0 && (
        <View style={styles.card}>
          {items.length === 0 ? (
            <Text style={styles.empty}>No recent news about the players and teams you follow.</Text>
          ) : (
            items.map((a, i) => (
              <Pressable key={`${a.link}-${i}`} style={styles.row} onPress={() => (a.url || a.link) && Linking.openURL((a.url || a.link)!).catch(() => undefined)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.reason}>{favoriteReason(a, fav, players)} · {a.player}</Text>
                  <Text style={styles.headline} numberOfLines={2}>{a.title}</Text>
                  <Text style={styles.meta}>{[a.source, a.published ? timeAgo(a.published) : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                {!!(a.image || (a.link && images[a.link])) && <Image source={{ uri: a.image || images[a.link!]! }} style={styles.thumb} />}
              </Pressable>
            ))
          )}
        </View>
      )}

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation?.()}>
            <View style={styles.header}>
              <Text style={[styles.title, { flex: 1 }]}>Follow teams and players</Text>
              <Pressable onPress={() => setEditing(false)} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={styles.section}>TEAMS</Text>
              <View style={styles.grid}>
                {NFL_TEAMS.map(t => {
                  const on = fav.teams.includes(t);
                  return (
                    <Pressable key={t} style={[styles.team, on && styles.teamOn]} onPress={() => toggleFavoriteTeam(t)}>
                      <Text style={[styles.teamText, on && { color: colors.onPrimary }]}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.section}>PLAYERS</Text>
              {fav.players.length === 0 ? (
                <Text style={styles.sub}>Open any player (search above, trending, or your roster) and tap ☆ Follow.</Text>
              ) : (
                fav.players.map(id => (
                  <View key={id} style={styles.followRow}>
                    <Text style={styles.followName}>{players[id]?.full_name ?? id}</Text>
                    <Text style={styles.sub}>{[players[id]?.position, players[id]?.team].filter(Boolean).join(' · ')}</Text>
                    <Pressable onPress={() => toggleFavoritePlayer(id)} hitSlop={8} accessibilityLabel="Unfollow">
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 460, backgroundColor: c.surface, borderRadius: radius.lg, paddingVertical: 16 },
  section: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8, marginTop: 8, marginBottom: 6, paddingHorizontal: 16 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, paddingHorizontal: 16 },
  team: { width: 58, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: c.surfaceMuted, alignItems: 'center' as const },
  teamOn: { backgroundColor: c.primary },
  teamText: { fontWeight: '800' as const, color: c.text, fontSize: 13 },
  followRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  followName: { fontSize: 14, fontWeight: '700' as const, color: c.text },
});
