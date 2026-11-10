// app/screens/FollowingScreen.tsx
// "Following": every player and team you follow in one organized place. Players are grouped by
// position (or team / A-Z) with this week's opponent, Sleeper projection in your league's scoring
// and injury status; teams show this week's game, how many of your followed players they have,
// and their latest headline. Tap a player to open him; tap ★ to unfollow.

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../AppNavigator';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useFantasy } from '../context/FantasyContext';
import { followPlayers, toggleFavoritePlayer, toggleFavoriteTeam, useFavorites } from '../services/favorites';
import { groupFollowed, opponentsFromProjections, rosterToFollow, type FollowedPlayer, type SortMode } from '../services/following';
import { getLeague, getNFLState, getPlayersFromGithub } from '../services/sleeperAPI';
import { getWeekProjections, projectedPoints, type ProjectionFile } from '../services/projections';
import { getInjuryIndex } from '../services/injuryService';
import { currentInjury, indexInjuries } from '../services/injuryFormat';
import { getNewsFiles, TEAM_NEWS_FILES } from '../services/newsService';
import type { NewsItem } from '../services/newsDiversity';
import { NFL_TEAMS } from '../services/playerStatus';
import { radius, type Palette } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const SORTS: { mode: SortMode; label: string }[] = [
  { mode: 'position', label: 'Position' },
  { mode: 'team', label: 'NFL team' },
  { mode: 'name', label: 'A-Z' },
];

export default function FollowingScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { activeLeagueId, myTeam } = useFantasy();
  const fav = useFavorites();
  const [tab, setTab] = useState<'players' | 'teams'>('players');
  const [sort, setSort] = useState<SortMode>('position');
  const [picking, setPicking] = useState(false);
  const [players, setPlayers] = useState<Record<string, any>>({});
  const [proj, setProj] = useState<ProjectionFile | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [scoring, setScoring] = useState<number | Record<string, number>>(1);
  const [injuries, setInjuries] = useState(indexInjuries(null));
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    getPlayersFromGithub().then(setPlayers).catch(() => undefined);
    getInjuryIndex().then(setInjuries).catch(() => undefined);
    getNewsFiles(TEAM_NEWS_FILES).then(setNews).catch(() => undefined);
    getNFLState()
      .then(s => {
        const season = Number(s?.season), wk = Number(s?.week);
        if (!season || !wk) return;
        setWeek(wk);
        return getWeekProjections(season, wk).then(setProj);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeLeagueId) return;
    getLeague(activeLeagueId)
      .then((l: any) => l?.scoring_settings && typeof l.scoring_settings === 'object' && setScoring(l.scoring_settings))
      .catch(() => undefined);
  }, [activeLeagueId]);

  const opponents = useMemo(() => opponentsFromProjections(proj?.players), [proj]);
  const opponentOf = (team: string) => (!team ? null : opponents.get(team.toUpperCase()) ?? (proj ? 'BYE' : null));

  const followed: FollowedPlayer[] = useMemo(
    () =>
      fav.players.map(id => {
        const p = players[id] ?? {};
        const entry = proj?.players?.[id];
        const injury = currentInjury(injuries, { ...p, player_id: id }).status;
        return {
          id,
          name: p.full_name ?? (p.position === 'DEF' ? `${p.team ?? id} D/ST` : entry?.name ?? id),
          position: p.position ?? entry?.pos ?? '',
          team: p.team ?? entry?.team ?? '',
          opponent: opponentOf(p.team ?? entry?.team ?? ''),
          projection: entry ? projectedPoints(entry, scoring) : null,
          injury: injury || undefined,
        };
      }),
    [fav.players, players, proj, scoring, injuries, opponents]
  );
  const sections = useMemo(() => groupFollowed(followed, sort), [followed, sort]);
  const toFollow = rosterToFollow((myTeam?.players ?? []).map(p => p.playerId), fav.players);

  const teamRows = useMemo(
    () =>
      fav.teams.map(team => {
        const headline = news.find(n => {
          const pl = Object.values(players).find((p: any) => p?.full_name === n.player) as any;
          return pl?.team === team;
        });
        return { team, opponent: opponentOf(team), count: followed.filter(p => p.team === team).length, headline };
      }),
    [fav.teams, news, players, followed, opponents]
  );

  const openPlayer = (id: string) => {
    const p = players[id];
    if (p) navigation.navigate('PlayerDetails', { player: { ...p, player_id: id }, stats: {}, fantasyPoints: 0 });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={styles.tabs}>
        {(['players', 'teams'] as const).map(t => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && { color: colors.onPrimary }]}>
              {t === 'players' ? `Players (${fav.players.length})` : `Teams (${fav.teams.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'players' ? (
        <>
          <View style={styles.toolbar}>
            {SORTS.map(s => (
              <Pressable key={s.mode} style={[styles.chip, sort === s.mode && styles.chipOn]} onPress={() => setSort(s.mode)}>
                <Text style={[styles.chipText, sort === s.mode && { color: colors.primary }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
          {toFollow.length > 0 && (
            <Pressable style={styles.rosterBtn} onPress={() => followPlayers(toFollow)}>
              <Ionicons name="people-outline" size={16} color={colors.primary} />
              <Text style={styles.rosterText}>
                Follow my roster ({toFollow.length} more{myTeam?.teamName ? ` from ${myTeam.teamName}` : ''})
              </Text>
            </Pressable>
          )}
          {week != null && <Text style={styles.note}>Week {week} · projections are Sleeper's, in your league's scoring</Text>}
          {sections.length === 0 ? (
            <Text style={styles.empty}>You don't follow any players yet. Open a player and tap ☆ Follow, or follow your whole roster above.</Text>
          ) : (
            sections.map(sec => (
              <View key={sec.title} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {sec.title} <Text style={styles.count}>{sec.players.length}</Text>
                </Text>
                {sec.players.map(p => (
                  <Pressable key={p.id} style={styles.row} onPress={() => openPlayer(p.id)}>
                    <View style={styles.pos}><Text style={styles.posText}>{p.position || '—'}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.name}
                        {!!p.injury && <Text style={styles.injury}>  {p.injury}</Text>}
                      </Text>
                      <Text style={styles.meta}>
                        {p.team || 'Free agent'}
                        {p.opponent ? (p.opponent === 'BYE' ? ' · Bye week' : ` · vs ${p.opponent}`) : ''}
                      </Text>
                    </View>
                    <Text style={styles.proj}>{p.projection != null ? p.projection.toFixed(2) : '—'}</Text>
                    <Pressable onPress={() => toggleFavoritePlayer(p.id)} hitSlop={10} accessibilityLabel={`Unfollow ${p.name}`}>
                      <Ionicons name="star" size={18} color={colors.warning} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </>
      ) : (
        <>
          <Pressable style={styles.rosterBtn} onPress={() => setPicking(v => !v)}>
            <Ionicons name={picking ? 'checkmark' : 'add'} size={16} color={colors.primary} />
            <Text style={styles.rosterText}>{picking ? 'Done' : 'Follow or unfollow teams'}</Text>
          </Pressable>
          {picking && (
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
          )}
          {teamRows.length === 0 ? (
            <Text style={styles.empty}>You don't follow any teams yet.</Text>
          ) : (
            <View style={styles.card}>
              {teamRows.map(r => (
                <View key={r.team} style={styles.row}>
                  <View style={styles.pos}><Text style={styles.posText}>{r.team}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {r.opponent ? (r.opponent === 'BYE' ? 'Bye week' : `This week vs ${r.opponent}`) : r.team}
                    </Text>
                    <Text style={styles.meta} numberOfLines={2}>
                      {r.count ? `${r.count} followed player${r.count > 1 ? 's' : ''} · ` : ''}
                      {r.headline?.title ?? 'No recent headlines'}
                    </Text>
                  </View>
                  <Pressable onPress={() => toggleFavoriteTeam(r.team)} hitSlop={10} accessibilityLabel={`Unfollow ${r.team}`}>
                    <Ionicons name="star" size={18} color={colors.warning} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  container: { flex: 1, backgroundColor: c.background },
  tabs: { flexDirection: 'row' as const, backgroundColor: c.surfaceMuted, borderRadius: radius.pill, padding: 4, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' as const },
  tabOn: { backgroundColor: c.primary },
  tabText: { fontWeight: '800' as const, color: c.text, fontSize: 13 },
  toolbar: { flexDirection: 'row' as const, gap: 6, marginBottom: 10 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { borderColor: c.primary, backgroundColor: c.primarySoft },
  chipText: { fontSize: 12, fontWeight: '700' as const, color: c.textMuted },
  rosterBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, alignSelf: 'flex-start' as const, backgroundColor: c.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 10 },
  rosterText: { color: c.primary, fontWeight: '700' as const, fontSize: 12 },
  note: { fontSize: 11, color: c.textMuted, marginBottom: 8 },
  empty: { color: c.textMuted, textAlign: 'center' as const, padding: 24 },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, marginBottom: 12, overflow: 'hidden' as const },
  cardTitle: { fontSize: 12, fontWeight: '900' as const, color: c.textMuted, letterSpacing: 0.6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  count: { color: c.primary },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
  pos: { minWidth: 40, paddingVertical: 4, borderRadius: 8, backgroundColor: c.surfaceMuted, alignItems: 'center' as const },
  posText: { fontSize: 11, fontWeight: '900' as const, color: c.text },
  name: { fontSize: 14, fontWeight: '700' as const, color: c.text },
  injury: { fontSize: 12, fontWeight: '900' as const, color: c.danger },
  meta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  proj: { fontSize: 14, fontWeight: '800' as const, color: c.text, minWidth: 46, textAlign: 'right' as const },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginBottom: 12 },
  team: { width: 56, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center' as const },
  teamOn: { backgroundColor: c.primary, borderColor: c.primary },
  teamText: { fontWeight: '800' as const, fontSize: 12, color: c.text },
});
