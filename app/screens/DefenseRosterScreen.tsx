import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../AppNavigator';
import { getPlayersFromGithub } from '../services/sleeperAPI';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'DefenseRoster'>;
type DefenseRosterRouteProp = RouteProp<RootStackParamList, 'DefenseRoster'>;

const DEFENSE_POSITION_ORDER = ['DL', 'DE', 'DT', 'EDGE', 'LB', 'ILB', 'OLB', 'CB', 'DB', 'S', 'SS', 'FS'];

const normalizeTeam = (value?: string) => {
  const team = String(value || '').toUpperCase().trim();
  const aliases: Record<string, string> = {
    WSH: 'WAS',
    JAC: 'JAX',
    LA: 'LAR',
  };
  return aliases[team] || team;
};

const isIndividualDefensivePosition = (position?: string) => {
  const pos = String(position || '').toUpperCase().trim();
  return ['DL', 'DE', 'DT', 'EDGE', 'LB', 'ILB', 'OLB', 'CB', 'DB', 'S', 'SS', 'FS'].includes(pos);
};

const getPositionSortRank = (position?: string) => {
  const pos = String(position || '').toUpperCase().trim();
  const index = DEFENSE_POSITION_ORDER.indexOf(pos);
  return index === -1 ? 999 : index;
};

const getHeadshotUrl = (player: any) => {
  if (player?.espn_id) {
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`;
  }
  if (player?.player_id) {
    return `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`;
  }
  return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
};

export default function DefenseRosterScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<DefenseRosterRouteProp>();
  const { team, week } = route.params;

  const [allPlayersById, setAllPlayersById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRoster = async () => {
      setLoading(true);
      try {
        const allPlayers = await getPlayersFromGithub();
        setAllPlayersById(allPlayers || {});
      } catch (err) {
        console.error('Error loading defense roster players:', err);
        setAllPlayersById({});
      } finally {
        setLoading(false);
      }
    };

    loadRoster();
  }, []);

  const groupedRoster = useMemo(() => {
    const defTeam = normalizeTeam(team);
    const playersForTeam = Object.entries(allPlayersById || {})
      .map(([id, p]: [string, any]) => ({ ...p, player_id: id }))
      .filter((p: any) => normalizeTeam(p?.team) === defTeam && isIndividualDefensivePosition(p?.position))
      .sort((a: any, b: any) => {
        const posRank = getPositionSortRank(a?.position) - getPositionSortRank(b?.position);
        if (posRank !== 0) return posRank;

        const depthA = Number(a?.depth_chart_order);
        const depthB = Number(b?.depth_chart_order);
        const safeDepthA = Number.isFinite(depthA) ? depthA : 999;
        const safeDepthB = Number.isFinite(depthB) ? depthB : 999;
        if (safeDepthA !== safeDepthB) return safeDepthA - safeDepthB;

        return String(a?.full_name || '').localeCompare(String(b?.full_name || ''));
      });

    const grouped = new Map<string, any[]>();
    playersForTeam.forEach((p: any) => {
      const pos = String(p?.position || '').toUpperCase().trim() || 'OTHER';
      if (!grouped.has(pos)) grouped.set(pos, []);
      grouped.get(pos)!.push(p);
    });

    return Array.from(grouped.entries()).sort((a, b) => getPositionSortRank(a[0]) - getPositionSortRank(b[0]));
  }, [allPlayersById, team]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>{team} Defense</Text>
        <Text style={styles.subtitle}>Grouped by position, ordered by depth chart</Text>
      </View>

      {loading ? (
        <Text style={styles.statusText}>Loading Defensive Roster...</Text>
      ) : groupedRoster.length === 0 ? (
        <Text style={styles.statusText}>No defensive players found</Text>
      ) : (
        groupedRoster.map(([positionKey, playersInGroup]: [string, any[]]) => (
          <View key={positionKey} style={styles.groupBlock}>
            <Text style={styles.groupTitle}>{positionKey}</Text>
            {playersInGroup.map((defPlayer: any) => {
              const depthOrder = Number(defPlayer?.depth_chart_order);
              const depthLabel = Number.isFinite(depthOrder) ? `Depth ${depthOrder}` : 'Depth N/A';

              return (
                <TouchableOpacity
                  key={String(defPlayer.player_id)}
                  style={styles.playerRow}
                  onPress={() =>
                    navigation.navigate('PlayerDetails', {
                      player: defPlayer,
                      stats: {},
                      week,
                      fantasyPoints: 0,
                    })
                  }
                >
                  <Image source={{ uri: getHeadshotUrl(defPlayer) }} style={styles.playerImage} />
                  <View style={styles.playerMeta}>
                    <Text style={styles.playerName}>{defPlayer.full_name || 'Unknown Player'}</Text>
                    <Text style={styles.playerSub}>{depthLabel}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  content: {
    padding: 16,
  },

  headerCard: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f4f6fc',
    borderWidth: 1,
    borderColor: '#e8eaf0',
    marginBottom: 14,
  },

  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },

  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },

  statusText: {
    fontSize: 16,
    color: '#374151',
    marginTop: 10,
  },

  groupBlock: {
    marginBottom: 14,
  },

  groupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fc',
    borderWidth: 1,
    borderColor: '#e5e9f2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },

  playerImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },

  playerMeta: {
    flex: 1,
  },

  playerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },

  playerSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
});
