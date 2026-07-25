import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Modal, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PlayerCard from './PlayerCard';

type Props = {
  players: any;
  onSelect: (player: any) => void;
};

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

const toggleValue = (values: string[], value: string) =>
  values.includes(value) ? values.filter(v => v !== value) : [...values, value];

const getHeadshotUrl = (player: any) => {
  if (player?.espn_id) return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`;
  if (player?.player_id) return `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`;
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

export default function SearchBarAndFilter({ players, onSelect }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPositions, setFilterPositions] = useState<string[]>([]);
  const [filterTeams, setFilterTeams] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q && filterPositions.length === 0 && filterTeams.length === 0) return [];
    return Object.entries(players || {})
      .filter(([id, p]: [string, any]) => {
        const matchesQuery = !q ||
          (p.full_name?.toLowerCase().includes(q)) ||
          (p.position?.toLowerCase() === q);
        const matchesPos = filterPositions.length === 0 || filterPositions.includes(String(p.position_for_FFHelper || p.position || ''));
        const matchesTeam = filterTeams.length === 0 || filterTeams.includes(String(p.team || ''));
        const isTeamDef = String((p.position_for_FFHelper || p.position || '').toUpperCase()).trim() === 'DEF';
        return matchesQuery && matchesPos && matchesTeam && (p.active || isTeamDef);
      })
      .map(([id, p]: [string, any]) => ({ ...p, player_id: id }))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
      .slice(0, 30);
  }, [searchQuery, filterPositions, filterTeams, players]);

  const isSearchActive = searchQuery.trim().length > 0 || filterPositions.length > 0 || filterTeams.length > 0;
  const activeFilterCount = filterPositions.length + filterTeams.length;

  return (
    <>
      <View style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Ionicons name="search" size={18} color="#999" style={{ marginRight: 8 }} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: '#1e1e1e' }}
            placeholder="Search players by name or position…"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.trim().length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ marginLeft: 8, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={[{ width: 42, height: 42, borderRadius: 10, borderWidth: 1.5, borderColor: '#4f46e5', justifyContent: 'center', alignItems: 'center' }, activeFilterCount > 0 ? { backgroundColor: '#4f46e5' } : {}]} onPress={() => setShowFilterModal(true)}>
          <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? '#fff' : '#4f46e5'} />
        </TouchableOpacity>
      </View>

      {!!(filterPositions.length || filterTeams.length) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 6, gap: 8, backgroundColor: '#fff' }}>
          {filterPositions.map((pos) => (
            <TouchableOpacity key={`pos-${pos}`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 4 }} onPress={() => setFilterPositions(prev => prev.filter(v => v !== pos))}>
              <Text style={{ fontSize: 13, color: '#4f46e5', fontWeight: '600' }}>{pos}</Text>
              <Ionicons name="close" size={13} color="#4f46e5" />
            </TouchableOpacity>
          ))}
          {filterTeams.map((team) => (
            <TouchableOpacity key={`team-${team}`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 4 }} onPress={() => setFilterTeams(prev => prev.filter(v => v !== team))}>
              <Text style={{ fontSize: 13, color: '#4f46e5', fontWeight: '600' }}>{team}</Text>
              <Ionicons name="close" size={13} color="#4f46e5" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isSearchActive && (
        <View style={{ height: 360, marginHorizontal: 16, marginTop: 10, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden' }}>
          {searchResults.length === 0 ? (
            <Text style={{ textAlign: 'center', marginTop: 40, color: '#999', fontSize: 15 }}>No players found</Text>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.player_id}
              renderItem={({ item }) => (
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', justifyContent: 'space-between' }} onPress={() => onSelect(item)}>
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
              )}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              scrollEnabled={true}
            />
          )}
        </View>
      )}

      <Modal visible={showFilterModal} animationType="slide" transparent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setShowFilterModal(false)} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '80%' }}>
          <View style={{ width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#1e1e1e' }}>Filter Players</Text>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Offense</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {OFFENSE_POSITIONS.map(pos => (
              <TouchableOpacity key={pos} style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafafa' }, filterPositions.includes(pos) ? { backgroundColor: '#4f46e5', borderColor: '#4f46e5' } : {}]} onPress={() => setFilterPositions(prev => toggleValue(prev, pos))}>
                <Text style={[{ fontSize: 13, fontWeight: '600', color: '#444' }, filterPositions.includes(pos) ? { color: '#fff' } : {}]}>{pos}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Defense</Text>
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            <TouchableOpacity style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafafa', marginRight: 8 }, filterPositions.includes('DEF') ? { backgroundColor: '#4f46e5', borderColor: '#4f46e5' } : {}]} onPress={() => setFilterPositions(prev => toggleValue(prev, 'DEF'))}>
              <Text style={[{ fontSize: 13, fontWeight: '600', color: '#444' }, filterPositions.includes('DEF') ? { color: '#fff' } : {}]}>DEF</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c8797', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>Trenches</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {DEFENSE_TRENCHES.map(pos => (
              <TouchableOpacity key={pos} style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafafa' }, filterPositions.includes(pos) ? { backgroundColor: '#4f46e5', borderColor: '#4f46e5' } : {}]} onPress={() => setFilterPositions(prev => toggleValue(prev, pos))}>
                <Text style={[{ fontSize: 13, fontWeight: '600', color: '#444' }, filterPositions.includes(pos) ? { color: '#fff' } : {}]}>{pos}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c8797', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>Linebackers</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {DEFENSE_LINEBACKERS.map(pos => (
              <TouchableOpacity key={pos} style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafafa' }, filterPositions.includes(pos) ? { backgroundColor: '#4f46e5', borderColor: '#4f46e5' } : {}]} onPress={() => setFilterPositions(prev => toggleValue(prev, pos))}>
                <Text style={[{ fontSize: 13, fontWeight: '600', color: '#444' }, filterPositions.includes(pos) ? { color: '#fff' } : {}]}>{pos}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c8797', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>Secondary</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {DEFENSE_SECONDARY.map(pos => (
              <TouchableOpacity key={pos} style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafafa' }, filterPositions.includes(pos) ? { backgroundColor: '#4f46e5', borderColor: '#4f46e5' } : {}]} onPress={() => setFilterPositions(prev => toggleValue(prev, pos))}>
                <Text style={[{ fontSize: 13, fontWeight: '600', color: '#444' }, filterPositions.includes(pos) ? { color: '#fff' } : {}]}>{pos}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Team</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {NFL_TEAMS.map(team => (
              <TouchableOpacity key={team} style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafafa' }, filterTeams.includes(team) ? { backgroundColor: '#4f46e5', borderColor: '#4f46e5' } : {}]} onPress={() => setFilterTeams(prev => toggleValue(prev, team))}>
                <Text style={[{ fontSize: 13, fontWeight: '600', color: '#444' }, filterTeams.includes(team) ? { color: '#fff' } : {}]}>{team}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={{ marginTop: 20, alignItems: 'center', paddingVertical: 10 }} onPress={() => { setFilterPositions([]); setFilterTeams([]); }}>
            <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 15 }}>Clear All Filters</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: 10, backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }} onPress={() => setShowFilterModal(false)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Apply</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}
