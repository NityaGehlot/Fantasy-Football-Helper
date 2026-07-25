import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Image, TouchableOpacity, FlatList, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPlayersFromGithub, getTrendingPlayers, TrendType } from '../services/sleeperAPI';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../AppNavigator';
import PlayerCard from '../components/PlayerCard';
import SearchBarAndFilter from '../components/SearchBarAndFilter';

export default function HomeScreen() {
  const [players, setPlayers] = useState<any>({});
  const [trendingPlayers, setTrendingPlayers] = useState<any[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [trendType, setTrendType] = useState<TrendType>('add');
  

  type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
  const navigation = useNavigation<NavigationProp>();

  const OFFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
  const DEFENSE_TRENCHES = ['DL', 'DE', 'DT', 'NT'];
  const DEFENSE_LINEBACKERS = ['LB', 'ILB', 'MLB', 'OLB'];
  const DEFENSE_SECONDARY = ['CB', 'DB', 'S', 'SS', 'FS'];
  const NFL_TEAMS = [
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE',
    'DAL','DEN','DET','GB','HOU','IND','JAX','KC',
    'LAC','LAR','LV','MIA','MIN','NE','NO','NYG',
    'NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'
  ];

  

  useEffect(() => {
    const loadPlayers = async () => {
      setLoadingPlayers(true);
      try {
        const playersData = await getPlayersFromGithub();
        setPlayers(playersData);
      } catch (err) {
        console.error('Error loading players:', err);
      } finally {
        setLoadingPlayers(false);
      }
    };
    loadPlayers();
  }, []);

  useEffect(() => {
    const loadTrending = async () => {
      setLoadingTrending(true);
      try {
        const trendingData = await getTrendingPlayers(trendType, 25);
        setTrendingPlayers(trendingData);
      } catch (err) {
        console.error('Error loading trending players:', err);
      } finally {
        setLoadingTrending(false);
      }
    };
    loadTrending();
  }, [trendType]);

  const getHeadshotUrl = (player: any) => {
    if (player?.espn_id) {
      return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`;
    }
    if (player?.player_id) {
      return `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`;
    }
    return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
  };

  const getTeamLogo = (teamAbbrev: string) => {
    if (!teamAbbrev) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
    return `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${teamAbbrev.trim()}`;
  };

  const getPositionColor = (pos: string) => {
    switch (pos) {
      case 'QB': return '#ff6b6b';
      case 'RB': return '#2ec4b6';
      case 'WR': return '#48b0f7';
      case 'TE': return '#ffbe0b';
      case 'K': return '#9d4edd';
      case 'DEF': return '#777';
      default: return '#aaa';
    }
  };

  const renderTrendingItem = ({ item, index }: { item: any; index: number }) => {
    const player = players[item.player_id] ?? item;
    if (!player) return null;
    const isAdd = trendType === 'add';

    const posToUse = String(player.position_for_FFHelper || player.position || player.position_listed_on_sleeper || '').toUpperCase().trim();
    return (
      <TouchableOpacity
        key={item.player_id}
        style={styles.trendingItem}
        onPress={() =>
          navigation.navigate('PlayerDetails', {
            player: { ...player, player_id: item.player_id },
            stats: {},
            week: 1,
            fantasyPoints: 0,
          })
        }
      >
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{index + 1}</Text>
        </View>

        <PlayerCard
          player={{ ...player, player_id: item.player_id }}
          compact
          position={posToUse}
          positionColor={getPositionColor(posToUse)}
          imageUri={posToUse === 'DEF' || player.position === 'DEF' ? getTeamLogo(player.team) : getHeadshotUrl(player)}
        />

        <View style={styles.trendInfo}>
          <View style={styles.trendCountRow}>
            <Text style={[styles.trendCount, isAdd ? styles.trendCountAdd : styles.trendCountDrop]}>{item.count}</Text>
            <Ionicons
              name={isAdd ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={isAdd ? '#16a34a' : '#dc2626'}
              style={styles.trendArrow}
            />
          </View>
          <Text style={styles.trendLabel}>{isAdd ? 'adds' : 'drops'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSearchResult = ({ item }: { item: any }) => (
    <TouchableOpacity
        style={styles.searchResultItem}
        onPress={() =>
          navigation.navigate('PlayerDetails', {
            player: item,
            stats: {},
            week: 1,
            fantasyPoints: 0,
          })
        }
      >
        <View style={{ flex: 1 }}>
          <PlayerCard
            player={item}
            compact
            position={String(item.position_for_FFHelper || item.position || item.position_listed_on_sleeper || '').toUpperCase().trim()}
            positionColor={getPositionColor(String(item.position_for_FFHelper || item.position || item.position_listed_on_sleeper || '').toUpperCase().trim())}
            imageUri={(String(item.position_for_FFHelper || item.position || '').toUpperCase().trim() === 'DEF' || item.position === 'DEF') ? getTeamLogo(item.team) : getHeadshotUrl(item)}
          />
        </View>
        <Ionicons name="chevron-forward" size={20} color="#aaa" style={{ marginLeft: 10 }} />
      </TouchableOpacity>
  );

  if (loadingPlayers || loadingTrending) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text>Loading trending players...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>Search for Players</Text>
        </View>

        <SearchBarAndFilter players={players} onSelect={(p) => navigation.navigate('PlayerDetails', { player: p, stats: {}, week: 1, fantasyPoints: 0 })} />

        {/* ── Trending heading ── */}
        <View style={styles.trendingSectionHeader}>
          <Text style={styles.title}>Player News & Trends</Text>
          <Text style={styles.subtitle}>
            Top trending {trendType === 'add' ? 'adds' : 'drops'} in the last 24 hours
          </Text>
          <View style={styles.trendToggleRow}>
            <TouchableOpacity
              style={[styles.trendToggleBtn, trendType === 'add' && styles.trendToggleBtnAddActive]}
              onPress={() => setTrendType('add')}
            >
              <Text style={[styles.trendToggleText, trendType === 'add' && styles.trendToggleTextActive]}>Adds</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.trendToggleBtn, trendType === 'drop' && styles.trendToggleBtnDropActive]}
              onPress={() => setTrendType('drop')}
            >
              <Text style={[styles.trendToggleText, trendType === 'drop' && styles.trendToggleTextActive]}>Drops</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Compare shortcut: navigates to ComparePlayer screen allowing user to pick two players */}
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <TouchableOpacity
            style={{ backgroundColor: '#eef2ff', padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#dbe7ff' }}
            onPress={() => navigation.navigate('ComparePlayer', {})}
          >
            <Text style={{ color: '#3730a3', fontWeight: '700' }}>Compare Players</Text>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>Select two players to compare</Text>
          </TouchableOpacity>
        </View>

        {/* ── Trending list (always shown) ── */}
        <View style={styles.trendingContainer}>
          <FlatList
            data={trendingPlayers}
            keyExtractor={(item) => item.player_id}
            renderItem={renderTrendingItem}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            scrollEnabled={true}
          />
        </View>
      </ScrollView>

      {/* Filter modal moved into SearchBarAndFilter component */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6fc',
  },
  pageContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  trendingContainer: {
    height: 500,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0px 2px 6px rgba(0,0,0,0.08)',
    elevation: 3,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#f5f5f5',
  },
  trendingSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 10,
  },
  trendToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  trendToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  trendToggleBtnAddActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },
  trendToggleBtnDropActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
  },
  trendToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  trendToggleTextActive: {
    color: '#111827',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e1e1e',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  trendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 0,
    padding: 15,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
    elevation: 3,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rankText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  positionBadge: {
    width: 40,
    height: 25,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  positionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  playerImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e1e1e',
  },
  playerTeam: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  trendInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  trendCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  trendCount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  trendCountAdd: {
    color: '#16a34a',
  },
  trendCountDrop: {
    color: '#dc2626',
  },
  trendArrow: {
    marginLeft: 4,
  },
  trendLabel: {
    fontSize: 12,
    color: '#666',
  },

  // ── Search ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1e1e1e',
    padding: 0,
  },
  searchClearBtn: {
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBtnActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    backgroundColor: '#fff',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ede9fe',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  chipText: {
    fontSize: 13,
    color: '#4f46e5',
    fontWeight: '600',
  },
  searchResultsContainer: {
    height: 360,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0px 2px 6px rgba(0,0,0,0.08)',
    elevation: 3,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    justifyContent: 'space-between',
  },
  searchResultImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginHorizontal: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#999',
    fontSize: 15,
  },

  // ── Filter Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    color: '#1e1e1e',
  },
  filterSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subFilterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7c8797',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterGroup: {
    marginBottom: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  pillActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },
  pillTextActive: {
    color: '#fff',
  },
  clearBtn: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 10,
  },
  clearBtnText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 15,
  },
  applyBtn: {
    marginTop: 10,
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
