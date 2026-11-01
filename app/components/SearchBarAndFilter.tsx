import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PlayerCard from './PlayerCard';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { getPositionColor, radius, type Palette } from '../theme';

type Props = {
  players: any;
  onSelect: (player: any) => void;
};

// Quick position chips; defensive groups cover every sub-position Sleeper/nflverse use.
const POSITION_GROUPS: { key: string; positions: string[] }[] = [
  { key: 'QB', positions: ['QB'] },
  { key: 'RB', positions: ['RB'] },
  { key: 'WR', positions: ['WR'] },
  { key: 'TE', positions: ['TE'] },
  { key: 'K', positions: ['K'] },
  { key: 'DEF', positions: ['DEF'] },
  { key: 'DL', positions: ['DL', 'DE', 'DT', 'NT'] },
  { key: 'LB', positions: ['LB', 'ILB', 'MLB', 'OLB'] },
  { key: 'DB', positions: ['CB', 'DB', 'S', 'SS', 'FS'] },
];
const NFL_TEAMS = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE',
  'DAL','DEN','DET','GB','HOU','IND','JAX','KC',
  'LAC','LAR','LV','MIA','MIN','NE','NO','NYG',
  'NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'
];

const toggleValue = (values: string[], value: string) =>
  values.includes(value) ? values.filter(v => v !== value) : [...values, value];

const positionOf = (p: any) => String(p.position_for_FFHelper || p.position || p.position_listed_on_sleeper || '').toUpperCase().trim();

const getHeadshotUrl = (player: any) => {
  if (player?.espn_id) return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`;
  if (player?.player_id) return `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`;
  return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
};

const getTeamLogo = (teamAbbrev: string) => {
  if (!teamAbbrev) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
  return `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${teamAbbrev.trim()}`;
};

export default function SearchBarAndFilter({ players, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [searchQuery, setSearchQuery] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [filterTeams, setFilterTeams] = useState<string[]>([]);
  const [showTeams, setShowTeams] = useState(false);

  const allowedPositions = useMemo(
    () => new Set(POSITION_GROUPS.filter(g => groups.includes(g.key)).flatMap(g => g.positions)),
    [groups]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q && groups.length === 0 && filterTeams.length === 0) return [];
    return Object.entries(players || {})
      .filter(([, p]: [string, any]) => {
        const pos = positionOf(p);
        const matchesQuery = !q || p.full_name?.toLowerCase().includes(q) || pos.toLowerCase() === q;
        const matchesPos = allowedPositions.size === 0 || allowedPositions.has(pos);
        const matchesTeam = filterTeams.length === 0 || filterTeams.includes(String(p.team || ''));
        return matchesQuery && matchesPos && matchesTeam && (p.active || pos === 'DEF');
      })
      .map(([id, p]: [string, any]) => ({ ...p, player_id: id }))
      .sort((a: any, b: any) => {
        const toRank = (v: any) => (v === null || !Number.isFinite(Number(v)) ? Number.MAX_SAFE_INTEGER : Number(v));
        const diff = toRank(a.search_rank) - toRank(b.search_rank);
        return diff !== 0 ? diff : (a.full_name || '').localeCompare(b.full_name || '');
      })
      .slice(0, 50);
  }, [searchQuery, allowedPositions, filterTeams, players, groups.length]);

  const isSearchActive = searchQuery.trim().length > 0 || groups.length > 0 || filterTeams.length > 0;
  const clearAll = () => {
    setGroups([]);
    setFilterTeams([]);
    setSearchQuery('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textSubtle} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search players"
            placeholderTextColor={colors.textSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {searchQuery.trim().length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.teamBtn, filterTeams.length > 0 && styles.teamBtnActive]}
          onPress={() => setShowTeams(true)}
          accessibilityLabel="Filter by team"
        >
          <Ionicons name="shield-outline" size={16} color={filterTeams.length ? colors.onPrimary : colors.primary} />
          <Text style={[styles.teamBtnText, filterTeams.length > 0 && { color: colors.onPrimary }]}>
            {filterTeams.length ? `${filterTeams.length} team${filterTeams.length > 1 ? 's' : ''}` : 'Team'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={[styles.chip, groups.length === 0 && styles.chipActive]} onPress={() => setGroups([])}>
          <Text style={[styles.chipText, groups.length === 0 && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {POSITION_GROUPS.map(g => {
          const on = groups.includes(g.key);
          return (
            <TouchableOpacity
              key={g.key}
              style={[styles.chip, on && { backgroundColor: getPositionColor(g.key), borderColor: getPositionColor(g.key) }]}
              onPress={() => setGroups(prev => toggleValue(prev, g.key))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{g.key}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filterTeams.length > 0 && (
        <View style={styles.activeRow}>
          {filterTeams.map(team => (
            <TouchableOpacity key={team} style={styles.activeChip} onPress={() => setFilterTeams(prev => prev.filter(v => v !== team))}>
              <Text style={styles.activeChipText}>{team}</Text>
              <Ionicons name="close" size={13} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isSearchActive && (
        <View style={styles.results}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>
              {searchResults.length === 50 ? 'Top 50 matches' : `${searchResults.length} player${searchResults.length === 1 ? '' : 's'}`}
            </Text>
            <TouchableOpacity onPress={clearAll}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {searchResults.length === 0 ? (
            <Text style={styles.noResults}>No players match. Try a different name or filter.</Text>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.player_id}
              renderItem={({ item }) => {
                const pos = positionOf(item);
                return (
                  <TouchableOpacity style={styles.resultRow} onPress={() => onSelect(item)}>
                    <View style={{ flex: 1 }}>
                      <PlayerCard
                        player={item}
                        compact
                        position={pos}
                        positionColor={getPositionColor(pos)}
                        imageUri={pos === 'DEF' ? getTeamLogo(item.team) : getHeadshotUrl(item)}
                      />
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                );
              }}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            />
          )}
        </View>
      )}

      <Modal visible={showTeams} animationType="fade" transparent onRequestClose={() => setShowTeams(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowTeams(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter by team</Text>
              <TouchableOpacity onPress={() => setShowTeams(false)} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.teamGrid}>
              {NFL_TEAMS.map(team => {
                const on = filterTeams.includes(team);
                return (
                  <TouchableOpacity key={team} style={[styles.teamCell, on && styles.teamCellOn]} onPress={() => setFilterTeams(prev => toggleValue(prev, team))}>
                    <Text style={[styles.teamCellText, on && { color: colors.onPrimary }]}>{team}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetSecondary} onPress={() => setFilterTeams([])}>
                <Text style={styles.sheetSecondaryText}>Clear teams</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetPrimary} onPress={() => setShowTeams(false)}>
                <Text style={styles.sheetPrimaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  wrap: { paddingTop: 4 },
  searchRow: { flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 8 },
  searchBox: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 15, color: c.text },
  teamBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, borderWidth: 1, borderColor: c.primary, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  teamBtnActive: { backgroundColor: c.primary },
  teamBtnText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  chip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { fontSize: 13, fontWeight: '700' as const, color: c.textMuted },
  chipTextActive: { color: '#fff' },
  activeRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, paddingHorizontal: 16, paddingBottom: 4 },
  activeChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: c.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  activeChipText: { fontSize: 12, fontWeight: '700' as const, color: c.primary },
  results: { height: 380, marginHorizontal: 16, marginTop: 6, backgroundColor: c.surface, borderRadius: radius.lg, overflow: 'hidden' as const, borderWidth: 1, borderColor: c.border },
  resultsHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  resultsCount: { fontSize: 12, fontWeight: '700' as const, color: c.textMuted },
  clearText: { fontSize: 13, fontWeight: '700' as const, color: c.primary },
  noResults: { textAlign: 'center' as const, marginTop: 40, color: c.textMuted, fontSize: 14, paddingHorizontal: 20 },
  resultRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 420, backgroundColor: c.surface, borderRadius: radius.lg, padding: 18 },
  sheetHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800' as const, color: c.text },
  teamGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  teamCell: { width: '22.5%' as const, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted, alignItems: 'center' as const },
  teamCellOn: { backgroundColor: c.primary, borderColor: c.primary },
  teamCellText: { fontWeight: '700' as const, color: c.text, fontSize: 13 },
  sheetActions: { flexDirection: 'row' as const, gap: 8, marginTop: 16 },
  sheetSecondary: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' as const, backgroundColor: c.surfaceMuted },
  sheetSecondaryText: { color: c.text, fontWeight: '700' as const },
  sheetPrimary: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' as const, backgroundColor: c.primary },
  sheetPrimaryText: { color: c.onPrimary, fontWeight: '800' as const },
});
