// app/screens/FollowingScreen.tsx
// Everything you follow in one place: your teams on top, then your players grouped by what you
// can do with them in your league (on your team / free agents / on other teams), each with this
// week's Sleeper projection and injury tag. Filter by position; tap a row to open the player.

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../AppNavigator';
import { useFantasy } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { toggleFavoritePlayer, toggleFavoriteTeam, useFavorites } from '../services/favorites';
import { FOLLOW_POSITIONS, groupFollowing, type FollowedPlayer } from '../services/following';
import { ownershipMap, type Ownership } from '../services/leagueOwnership';
import { getLeague, getLeagueUsers, getNFLState, getPlayersFromGithub, getRosters } from '../services/sleeperAPI';
import { getWeekProjections, projectedPoints } from '../services/projections';
import { NFL_TEAMS } from '../services/playerStatus';
import { getPositionColor, radius, type Palette } from '../theme';

export default function FollowingScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeLeagueId, myTeam } = useFantasy();
  const fav = useFavorites();
  const [players, setPlayers] = useState<Record<string, any> | null>(null);
  const [ownership, setOwnership] = useState<Map<string, Ownership> | null>(null);
  const [projections, setProjections] = useState<Record<string, number | null>>({});
  const [week, setWeek] = useState<number | null>(null);
  const [position, setPosition] = useState('ALL');
  const [editingTeams, setEditingTeams] = useState(false);

  useEffect(() => {
    getPlayersFromGithub().then(setPlayers).catch(() => setPlayers({}));
  }, []);

  // Who owns each player in the league you have open.
  useEffect(() => {
    let cancelled = false;
    setOwnership(null);
    if (!activeLeagueId) return;
    Promise.all([getRosters(activeLeagueId), getLeagueUsers(activeLeagueId).catch(() => [])])
      .then(([rosters, users]) => { if (!cancelled) setOwnership(ownershipMap(rosters as any, users as any, myTeam?.ownerId)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeLeagueId, myTeam?.ownerId]);

  // This week's Sleeper projections in your league's format (PPR / half / standard).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await getNFLState().catch(() => null);
      const season = Number(state?.season);
      const w = Number(state?.week);
      if (!season || !w || String(state?.season_type) !== 'regular') return;
      const [file, league] = await Promise.all([
        getWeekProjections(season, w),
        activeLeagueId ? getLeague(activeLeagueId).catch(() => null) : Promise.resolve(null),
      ]);
      if (cancelled || !file) return;
      const rec = Number((league as any)?.scoring_settings?.rec ?? 1);
      const out: Record<string, number | null> = {};
      for (const [id, entry] of Object.entries(file.players)) out[id] = projectedPoints(entry, rec);
      setWeek(w);
      setProjections(out);
    })();
    return () => { cancelled = true; };
  }, [activeLeagueId]);

  const groups = useMemo(
    () => groupFollowing(fav.players, players ?? {}, activeLeagueId ? ownership : null, projections, position),
    [fav.players, players, ownership, projections, position, activeLeagueId]
  );

  const openPlayer = (id: string) => {
    const p = players?.[id];
    if (p) navigation.navigate('PlayerDetails', { player: p, stats: {}, fantasyPoints: 0 });
  };

  const renderRow = (r: FollowedPlayer) => (
    <Pressable key={r.id} style={styles.row} onPress={() => openPlayer(r.id)}>
      <View style={[styles.pos, { backgroundColor: getPositionColor(r.position) }]}>
        <Text style={styles.posText}>{r.position || '?'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {r.team}
          {r.injury ? <Text style={{ color: r.injury === 'Q' ? colors.warning : colors.danger, fontWeight: '800' }}>{`  ${r.injury}`}</Text> : null}
          {r.owner && !r.owner.mine ? `  ·  ${r.owner.teamName}` : ''}
        </Text>
      </View>
      <View style={styles.projBox}>
        <Text style={styles.proj}>{r.projection !== null ? r.projection.toFixed(1) : '–'}</Text>
        <Text style={styles.projLabel}>{week ? `wk ${week}` : 'proj'}</Text>
      </View>
      <Pressable onPress={() => toggleFavoritePlayer(r.id)} hitSlop={10} accessibilityLabel={`Unfollow ${r.name}`}>
        <Ionicons name="star" size={20} color={colors.warning} />
      </Pressable>
    </Pressable>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
      {/* TEAMS */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Teams</Text>
          <Pressable style={styles.editBtn} onPress={() => setEditingTeams(!editingTeams)}>
            <Ionicons name={editingTeams ? 'checkmark' : 'add'} size={14} color={colors.primary} />
            <Text style={styles.editText}>{editingTeams ? 'Done' : fav.teams.length ? 'Edit' : 'Add teams'}</Text>
          </Pressable>
        </View>
        {editingTeams ? (
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
        ) : fav.teams.length === 0 ? (
          <Text style={styles.hint}>Follow teams to get their news on Home.</Text>
        ) : (
          <View style={styles.grid}>
            {[...fav.teams].sort().map(t => (
              <Pressable key={t} style={styles.teamChip} onPress={() => openPlayer(t)} accessibilityLabel={`${t} defense`}>
                <Text style={styles.teamChipText}>★ {t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* POSITION FILTER */}
      {fav.players.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {['ALL', ...FOLLOW_POSITIONS].map(p => (
            <Pressable key={p} style={[styles.filter, position === p && styles.filterOn]} onPress={() => setPosition(p)}>
              <Text style={[styles.filterText, position === p && { color: colors.onPrimary }]}>{p === 'ALL' ? 'All' : p}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* PLAYERS */}
      {!players ? (
        <ActivityIndicator style={{ padding: 24 }} />
      ) : fav.players.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Players</Text>
          <Text style={styles.hint}>
            Open any player (search on Home, trending, or your roster) and tap ☆ Follow. They'll show up here, sorted into
            your team, free agents you could pick up, and players on other teams you could trade for.
          </Text>
        </View>
      ) : groups.length === 0 ? (
        <Text style={styles.hint}>You don't follow any {position} yet.</Text>
      ) : (
        groups.map(g => (
          <View key={g.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{g.title}</Text>
              <Text style={styles.count}>{g.players.length}</Text>
            </View>
            {!!g.hint && <Text style={[styles.hint, { marginTop: -4, marginBottom: 4 }]}>{g.hint}</Text>}
            {g.players.map(renderRow)}
          </View>
        ))
      )}
      {!activeLeagueId && fav.players.length > 0 && (
        <Text style={styles.hint}>Open a league on the Fantasy tab to sort these into your team, free agents and trade targets.</Text>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  container: { flex: 1, backgroundColor: c.background },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  cardTitle: { fontSize: 17, fontWeight: '800' as const, color: c.text },
  count: { fontSize: 13, fontWeight: '800' as const, color: c.textMuted },
  hint: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
  editBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: c.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  editText: { color: c.primary, fontWeight: '700' as const, fontSize: 12 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  team: { width: 58, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: c.surfaceMuted, alignItems: 'center' as const },
  teamOn: { backgroundColor: c.primary },
  teamText: { fontWeight: '800' as const, color: c.text, fontSize: 13 },
  teamChip: { backgroundColor: c.warningSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  teamChipText: { color: c.warning, fontWeight: '800' as const, fontSize: 13 },
  filter: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: c.surfaceMuted },
  filterOn: { backgroundColor: c.primary },
  filterText: { fontWeight: '700' as const, fontSize: 13, color: c.text },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
  pos: { width: 38, borderRadius: 6, paddingVertical: 4, alignItems: 'center' as const },
  posText: { color: '#fff', fontWeight: '800' as const, fontSize: 11 },
  name: { fontSize: 15, fontWeight: '700' as const, color: c.text },
  meta: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  projBox: { alignItems: 'flex-end' as const, minWidth: 44 },
  proj: { fontSize: 15, fontWeight: '800' as const, color: c.text },
  projLabel: { fontSize: 10, color: c.textSubtle },
});
