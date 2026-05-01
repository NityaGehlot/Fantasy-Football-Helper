import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

export default function TeamRosterScreen({ route }: any) {
  const { roster, players, users } = route.params;

  const owner = users.find((u: any) => u.user_id === roster.owner_id);
  const teamName = owner?.metadata.team_name || owner?.display_name;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{teamName}</Text>
      <Text style={styles.subTitle}>Full Roster</Text>

      <FlatList
        data={roster.players}
        keyExtractor={(p) => p}
        renderItem={({ item }) => {
          const player = players[item];
          return (
            <View style={styles.playerRow}>
              <Text style={styles.playerName}>{player?.full_name}</Text>
              <Text style={styles.playerInfo}>
                {player?.position} — {player?.team}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 10 },
  subTitle: { fontSize: 20, marginBottom: 15 },
  playerRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  playerName: { fontSize: 18 },
  playerInfo: { fontSize: 14, color: '#555' },
});
