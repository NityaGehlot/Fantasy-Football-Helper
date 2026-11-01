import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPlayersFromGithub, getTrendingPlayers, TrendType } from '../services/sleeperAPI';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../AppNavigator';
import PlayerCard from '../components/PlayerCard';
import SearchBarAndFilter from '../components/SearchBarAndFilter';
import LeagueNewsCarousel from '../components/LeagueNewsCarousel';
import { useFantasy } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { getPositionColor, radius, shadowFor, type Palette } from '../theme';

const TRENDING_PREVIEW = 10;

const getHeadshotUrl = (player: any) => {
  if (player?.espn_id) return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`;
  if (player?.player_id) return `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`;
  return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
};

const getTeamLogo = (teamAbbrev: string) => {
  if (!teamAbbrev) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
  return `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${teamAbbrev.trim()}`;
};

const formatCount = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [players, setPlayers] = useState<any>({});
  const [trendingPlayers, setTrendingPlayers] = useState<any[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [trendType, setTrendType] = useState<TrendType>('add');
  const [showAllTrending, setShowAllTrending] = useState(false);

  type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
  const navigation = useNavigation<NavigationProp>();
  const { sendChatMessage, isChatTyping } = useFantasy();

  // Ask the assistant who to drop from your roster to make room for this player.
  const askWhoToDrop = (playerName: string) => {
    if (!playerName || isChatTyping) return;
    sendChatMessage(`Who should I drop to pick up ${playerName}?`);
    navigation.navigate('MainTabs', { screen: 'ChatBot' });
  };

  useEffect(() => {
    getPlayersFromGithub().then(setPlayers).catch(err => console.error('Error loading players:', err));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingTrending(true);
    getTrendingPlayers(trendType, 25)
      .then(data => !cancelled && setTrendingPlayers(data))
      .catch(err => console.error('Error loading trending players:', err))
      .finally(() => !cancelled && setLoadingTrending(false));
    return () => {
      cancelled = true;
    };
  }, [trendType]);

  const openPlayer = (player: any) => navigation.navigate('PlayerDetails', { player, stats: {}, fantasyPoints: 0 });
  const isAdd = trendType === 'add';
  const visibleTrending = showAllTrending ? trendingPlayers : trendingPlayers.slice(0, TRENDING_PREVIEW);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <SearchBarAndFilter players={players} onSelect={openPlayer} />

      <LeagueNewsCarousel />

      <TouchableOpacity style={styles.compareCard} onPress={() => navigation.navigate('ComparePlayer', {})}>
        <View style={styles.compareIcon}>
          <Ionicons name="git-compare-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.compareTitle}>Compare players</Text>
          <Text style={styles.compareSub}>Put any two players side by side</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Trending on Sleeper</Text>
          <Text style={styles.subtitle}>Most {isAdd ? 'added' : 'dropped'} players in the last 24 hours</Text>
        </View>
        <View style={styles.segment}>
          {(['add', 'drop'] as TrendType[]).map(t => (
            <TouchableOpacity key={t} style={[styles.segmentBtn, trendType === t && styles.segmentBtnOn]} onPress={() => setTrendType(t)}>
              <Text style={[styles.segmentText, trendType === t && styles.segmentTextOn]}>{t === 'add' ? 'Adds' : 'Drops'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.trendingCard}>
        {loadingTrending ? (
          <View style={{ padding: 30 }}><ActivityIndicator /></View>
        ) : trendingPlayers.length === 0 ? (
          <Text style={styles.empty}>No trending data right now.</Text>
        ) : (
          visibleTrending.map((item, index) => {
            const player = { ...(players[item.player_id] ?? item), player_id: item.player_id };
            const pos = String(player.position_for_FFHelper || player.position || player.position_listed_on_sleeper || '').toUpperCase().trim();
            const name = player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
            return (
              <TouchableOpacity key={item.player_id} style={styles.trendRow} onPress={() => openPlayer(player)}>
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <PlayerCard
                    player={player}
                    compact
                    position={pos}
                    positionColor={getPositionColor(pos)}
                    imageUri={pos === 'DEF' ? getTeamLogo(player.team) : getHeadshotUrl(player)}
                  />
                </View>
                <View style={styles.trendInfo}>
                  <View style={styles.trendCountRow}>
                    <Ionicons name={isAdd ? 'arrow-up' : 'arrow-down'} size={13} color={isAdd ? colors.success : colors.danger} />
                    <Text style={[styles.trendCount, { color: isAdd ? colors.success : colors.danger }]}>{formatCount(Number(item.count) || 0)}</Text>
                  </View>
                  {isAdd && (
                    <TouchableOpacity
                      style={styles.dropAskBtn}
                      onPress={() => askWhoToDrop(name)}
                      accessibilityLabel={`Ask who to drop to pick up ${name}`}
                    >
                      <Text style={styles.dropAskText} numberOfLines={1}>Who to drop?</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        {trendingPlayers.length > TRENDING_PREVIEW && (
          <TouchableOpacity style={styles.showMore} onPress={() => setShowAllTrending(s => !s)}>
            <Text style={styles.showMoreText}>{showAllTrending ? 'Show less' : `Show all ${trendingPlayers.length}`}</Text>
            <Ionicons name={showAllTrending ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  container: { flex: 1, backgroundColor: c.background },
  compareCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginHorizontal: 16, marginTop: 14, padding: 14, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  compareIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  compareTitle: { fontSize: 15, fontWeight: '800' as const, color: c.text },
  compareSub: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  sectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 16, marginTop: 22, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: '800' as const, color: c.text },
  subtitle: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  segment: { flexDirection: 'row' as const, backgroundColor: c.surfaceMuted, borderRadius: radius.pill, padding: 3 },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  segmentBtnOn: { backgroundColor: c.surface, ...shadowFor(c) },
  segmentText: { fontSize: 12, fontWeight: '700' as const, color: c.textMuted },
  segmentTextOn: { color: c.text },
  trendingCard: { marginHorizontal: 16, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' as const },
  empty: { color: c.textMuted, padding: 20, textAlign: 'center' as const },
  trendRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 },
  rank: { width: 20, textAlign: 'center' as const, fontSize: 13, fontWeight: '800' as const, color: c.textSubtle },
  trendInfo: { alignItems: 'flex-end' as const, gap: 6, flexShrink: 0 },
  trendCountRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  trendCount: { fontSize: 15, fontWeight: '800' as const },
  dropAskBtn: { backgroundColor: c.primarySoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  dropAskText: { fontSize: 11, fontWeight: '700' as const, color: c.primary },
  showMore: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4, paddingVertical: 12 },
  showMoreText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
});
