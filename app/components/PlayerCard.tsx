import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface Props {
  player: any;
  stats?: any;
  statLine?: string[];
  points?: number;
  imageUri?: string;
  position?: string;
  positionColor?: string;
  compact?: boolean;
}

export default function PlayerCard({ player, stats, statLine = [], points = 0, imageUri, position, positionColor, compact = false }: Props) {
  const injuryStatus = String(stats?.injury_status ?? "").toUpperCase().trim();
  const injuryType = stats?.primary_injury || stats?.practice_primary_injury || stats?.secondary_injury || "";
  const isOut = ["OUT", "IR", "IR-R", "INJURED RESERVE"].includes(injuryStatus);
  const isQuestionable = ["QUESTIONABLE", "DOUBTFUL"].includes(injuryStatus);

    if (compact) {
    return (
      <View style={compactStyles.container}>
        { (String(position || player.position).toUpperCase() === 'FLEX') ? (
          <View style={[compactStyles.positionBadge, { backgroundColor: '#888' }]}>
            <Text style={compactStyles.positionText}>WRT</Text>
          </View>
        ) : (
          <View style={[compactStyles.positionBadge, { backgroundColor: positionColor || '#aaa' }]}>
            <Text style={compactStyles.positionText}>{position || player.position}</Text>
          </View>
        )}

        <Image source={{ uri: imageUri || '' }} style={compactStyles.image} />

        <View style={compactStyles.info}>
          <Text style={compactStyles.name}>{player.full_name}</Text>
          <Text style={compactStyles.team}>{(position || player.position) + ' • ' + (player.team || '')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.playerRow}>
      { (String(position || player.position).toUpperCase() === 'FLEX') ? (
        <View style={[styles.positionBadgeRect, { backgroundColor: '#888' }]}>
          <Text style={styles.positionBadgeText}>WRT</Text>
        </View>
      ) : (
        <View style={[styles.positionBadgeRect, { backgroundColor: positionColor || '#aaa' }]}>
          <Text style={styles.positionBadgeText}>{player.position}</Text>
        </View>
      )}

      <Image source={{ uri: imageUri || '' }} style={styles.playerImage} />

      <View style={{ marginLeft: 10, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.playerName}>{player.full_name}</Text>
          {isOut && (
            <View style={{ backgroundColor: '#e53e3e', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>O</Text>
            </View>
          )}
          {isQuestionable && (
            <View style={{ backgroundColor: '#d69e2e', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Q</Text>
            </View>
          )}
        </View>

        <Text style={styles.playerSubText}>{player.position} • {stats?.team}</Text>

        <View style={{ marginTop: 4 }}>
          { (isOut || isQuestionable) && injuryType ? (
            <Text style={{ fontSize: 12, color: isOut ? '#e53e3e' : '#d69e2e', marginBottom: 4 }}>
              {injuryType}
            </Text>
          ) : null }

          {statLine && statLine.length > 0 ? (
            statLine.map((line, index) => (
              <Text key={index} style={[styles.statLine, { marginTop: index === 0 ? 0 : 2 }]}>
                {line}
              </Text>
            ))
          ) : (
            <Text style={styles.statLine}>No stats recorded</Text>
          )}
        </View>
      </View>

      <View style={styles.playerStats}>
        <Text style={styles.statText}>{(points || 0).toFixed(2)}</Text>
      </View>
    </View>
  );
}

const compactStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center' },
  positionBadge: { width: 56, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 10, overflow: 'hidden', flexDirection: 'row' },
  positionText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  image: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#1e1e1e' },
  team: { fontSize: 14, color: '#666', marginTop: 2 },
  flexStripe: { flex: 1, height: '100%' },
  flexLabelWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
});

const styles = StyleSheet.create({
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, width: '100%', paddingHorizontal: 16 },
  playerImage: { width: 50, height: 50, borderRadius: 25 },
  playerName: { fontSize: 16, fontWeight: '600' },
  playerSubText: { fontSize: 14, color: '#555' },
  positionBadgeRect: { width: 56, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 10, overflow: 'hidden', flexDirection: 'row' },
  positionBadgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stripeBlue: { flex: 1, height: '100%', backgroundColor: '#888' },
  stripeGreen: { flex: 1, height: '100%', backgroundColor: '#888' },
  stripeYellow: { flex: 1, height: '100%', backgroundColor: '#888' },
  flexLabelWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  playerStats: { flexDirection: 'row', width: 50 },
  playerStats: { width: 72, alignItems: 'flex-end', marginLeft: 'auto' },
  statText: { fontSize: 18, fontWeight: '800', textAlign: 'right' },
  statLine: { fontSize: 12, color: '#333' },
});
