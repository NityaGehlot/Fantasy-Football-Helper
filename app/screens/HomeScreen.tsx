import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Image, TouchableOpacity, FlatList, ScrollView, ActivityIndicator, TextInput, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPlayers, getTrendingPlayers } from '../services/sleeperAPI';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../AppNavigator';

export default function HomeScreen() {
  const [players, setPlayers] = useState<any>({});
  const [trendingPlayers, setTrendingPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);

  type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
  const navigation = useNavigation<NavigationProp>();

  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  const NFL_TEAMS = [
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE',
    'DAL','DEN','DET','GB','HOU','IND','JAX','KC',
    'LAC','LAR','LV','MIA','MIN','NE','NO','NYG',
    'NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'
  ];

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q && !filterPosition && !filterTeam) return [];
    return Object.entries(players)
      .filter(([id, p]: [string, any]) => {
        const matchesQuery = !q ||
          (p.full_name?.toLowerCase().includes(q)) ||
          (p.position?.toLowerCase() === q);
        const matchesPos = !filterPosition || p.position === filterPosition;
        const matchesTeam = !filterTeam || p.team === filterTeam;
        return matchesQuery && matchesPos && matchesTeam && p.active;
      })
      .map(([id, p]: [string, any]) => ({ ...p, player_id: id }))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
      .slice(0, 30);
  }, [searchQuery, filterPosition, filterTeam, players]);

  const isSearchActive = searchQuery.trim().length > 0 || !!filterPosition || !!filterTeam;
  const activeFilterCount = (filterPosition ? 1 : 0) + (filterTeam ? 1 : 0);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [playersData, trendingData] = await Promise.all([
          getPlayers(),
          getTrendingPlayers(24, 25)
        ]);
        setPlayers(playersData);
        setTrendingPlayers(trendingData);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const getHeadshotUrl = (player: any) => {
    if (player?.espn_id) {
      return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`;
    }
    if (player?.player_id) {
      return `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`;
    }
    return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
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
    const player = players[item.player_id];
    if (!player) return null;

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
        <View style={[styles.positionBadge, { backgroundColor: getPositionColor(player.position) }]}>
          <Text style={styles.positionText}>{player.position}</Text>
        </View>
        <Image source={{ uri: getHeadshotUrl(player) }} style={styles.playerImage} />
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{player.full_name}</Text>
          <Text style={styles.playerTeam}>{player.position} • {player.team}</Text>
        </View>
        <View style={styles.trendInfo}>
          <Text style={styles.trendCount}>+{item.count}</Text>
          <Text style={styles.trendLabel}>adds</Text>
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
      <View style={[styles.positionBadge, { backgroundColor: getPositionColor(item.position) }]}>
        <Text style={styles.positionText}>{item.position}</Text>
      </View>
      <Image source={{ uri: getHeadshotUrl(item) }} style={styles.searchResultImage} />
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{item.full_name}</Text>
        <Text style={styles.playerTeam}>{item.position} • {item.team || '—'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#aaa" />
    </TouchableOpacity>
  );

  if (loading) {
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
        {/* ── Search heading ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>Search for Players</Text>
        </View>

        {/* ── Search bar ── */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={18} color="#999" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players by name or position…"
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity
            style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
            onPress={() => setShowFilterModal(true)}
          >
            <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? '#fff' : '#4f46e5'} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Active filter chips ── */}
        {!!(filterPosition || filterTeam) && (
          <View style={styles.chipRow}>
            {filterPosition ? (
              <TouchableOpacity style={styles.chip} onPress={() => setFilterPosition('')}>
                <Text style={styles.chipText}>{filterPosition}</Text>
                <Ionicons name="close" size={13} color="#4f46e5" />
              </TouchableOpacity>
            ) : null}
            {filterTeam ? (
              <TouchableOpacity style={styles.chip} onPress={() => setFilterTeam('')}>
                <Text style={styles.chipText}>{filterTeam}</Text>
                <Ionicons name="close" size={13} color="#4f46e5" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* ── Search results (shown while searching) ── */}
        {isSearchActive && (
          <View style={styles.searchResultsContainer}>
            {searchResults.length === 0 ? (
              <Text style={styles.emptyText}>No players found</Text>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.player_id}
                renderItem={renderSearchResult}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                scrollEnabled={true}
              />
            )}
          </View>
        )}

        {/* ── Trending heading ── */}
        <View style={styles.trendingSectionHeader}>
          <Text style={styles.title}>Player News & Trends</Text>
          <Text style={styles.subtitle}>Top trending adds in the last 24 hours</Text>
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

      {/* ── Filter Modal ── */}
      <Modal visible={showFilterModal} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Filter Players</Text>

          <Text style={styles.filterSectionLabel}>Position</Text>
          <View style={styles.pillRow}>
            {POSITIONS.map(pos => (
              <TouchableOpacity
                key={pos}
                style={[styles.pill, filterPosition === pos && styles.pillActive]}
                onPress={() => setFilterPosition(prev => prev === pos ? '' : pos)}
              >
                <Text style={[styles.pillText, filterPosition === pos && styles.pillTextActive]}>{pos}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterSectionLabel}>Team</Text>
          <View style={styles.pillRow}>
            {NFL_TEAMS.map(team => (
              <TouchableOpacity
                key={team}
                style={[styles.pill, filterTeam === team && styles.pillActive]}
                onPress={() => setFilterTeam(prev => prev === team ? '' : team)}
              >
                <Text style={[styles.pillText, filterTeam === team && styles.pillTextActive]}>{team}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { setFilterPosition(''); setFilterTeam(''); }}
          >
            <Text style={styles.clearBtnText}>Clear All Filters</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilterModal(false)}>
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
    alignItems: 'center',
  },
  trendCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4f46e5',
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
    outlineStyle: 'none',
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
