import React from 'react';
import { View, Text, Image } from 'react-native';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { injuryShort, isOutStatus } from '../services/injuryFormat';
import { getPositionColor, type Palette } from '../theme';

interface Props {
  player: any;
  stats?: any;
  statLine?: string[];
  points?: number;
  imageUri?: string;
  position?: string;
  positionColor?: string;
  compact?: boolean;
  // Narrow layout for side-by-side columns (smaller badge/photo, wrapping name).
  dense?: boolean;
  team?: string;
}

// Flex slots are labeled the way Sleeper labels them.
const FLEX_LABELS: Record<string, string> = {
  FLEX: 'FLEX',
  SUPER_FLEX: 'SF',
  REC_FLEX: 'W/T',
  WRRB_FLEX: 'W/R',
  IDP_FLEX: 'IDP',
};

export default function PlayerCard({ player, stats, statLine = [], points = 0, imageUri, position, positionColor, compact = false, dense = false, team }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const injuryStatus = String(stats?.injury_status ?? "").toUpperCase().trim();
  const injuryType = stats?.primary_injury || stats?.practice_primary_injury || stats?.secondary_injury || "";
  const isBye = String(stats?.team_status ?? "").toLowerCase().includes("bye");
  const isOut = isOutStatus(injuryStatus) || injuryStatus === "INJURED RESERVE" || injuryStatus === "IR-R";
  const isQuestionable = ["QUESTIONABLE", "DOUBTFUL"].includes(injuryStatus);
  const injuryBadge = isOut ? (injuryShort(injuryStatus) || "O") : isQuestionable ? injuryShort(injuryStatus) : "";

  const slot = String(position || player.position || '').toUpperCase();
  const flexLabel = FLEX_LABELS[slot];
  const badgeLabel = flexLabel ?? (compact ? slot : String(player.position || slot));
  const badgeColor = flexLabel ? getPositionColor('FLEX') : positionColor || '#aaa';
  const teamLabel = team ?? stats?.team ?? player.team ?? '';

  const Badge = (
    <View style={[compact ? styles.badgeCompact : styles.badge, { backgroundColor: badgeColor }]}>
      <Text style={compact ? styles.badgeTextCompact : styles.badgeText}>{badgeLabel}</Text>
    </View>
  );

  if (compact) {
    return (
      <View style={styles.compactRow}>
        {Badge}
        <Image source={{ uri: imageUri || '' }} style={styles.imageCompact} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.nameCompact} numberOfLines={2}>{player.full_name}</Text>
          <Text style={styles.sub}>{`${slot}${player.team ? ` • ${player.team}` : ''}`}</Text>
        </View>
      </View>
    );
  }

  if (dense) {
    return (
      <View style={styles.denseRow}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={[styles.badgeDense, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeTextDense}>{badgeLabel}</Text>
          </View>
          <Image source={{ uri: imageUri || '' }} style={styles.imageDense} />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.nameDense} numberOfLines={2}>{player.full_name}</Text>
            {!!injuryBadge && (
              <View style={[styles.injuryPill, { backgroundColor: isOut ? colors.danger : colors.warning }]}>
                <Text style={styles.injuryPillText}>{injuryBadge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.statLine} numberOfLines={1}>{player.position}{teamLabel ? ` • ${teamLabel}` : ''}</Text>
          {statLine.length > 0 && <Text style={styles.statLine} numberOfLines={2}>{statLine.join(' · ')}</Text>}
          <Text style={styles.pointsDense}>{(points || 0).toFixed(2)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {Badge}
      <Image source={{ uri: imageUri || '' }} style={styles.image} />

      <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.name} numberOfLines={1}>{player.full_name}</Text>
          {!!injuryBadge && (
            <View style={[styles.injuryPill, { backgroundColor: isOut ? colors.danger : colors.warning }]}>
              <Text style={styles.injuryPillText}>{injuryBadge}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sub}>{player.position}{teamLabel ? ` • ${teamLabel}` : ''}</Text>

        <View style={{ marginTop: 4 }}>
          {(isOut || isQuestionable) && injuryType ? (
            <Text style={[styles.injuryText, { color: isOut ? colors.danger : colors.warning }]}>{injuryType}</Text>
          ) : null}

          {statLine && statLine.length > 0 ? (
            statLine.map((line, index) => (
              <Text key={index} style={[styles.statLine, { marginTop: index === 0 ? 0 : 2 }]}>
                {line}
              </Text>
            ))
          ) : (
            <Text style={styles.statLine}>{isBye ? "Bye week" : "No stats recorded"}</Text>
          )}
        </View>
      </View>

      <View style={styles.points}>
        <Text style={styles.pointsText}>{(points || 0).toFixed(2)}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  compactRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 12, width: '100%' as const, paddingHorizontal: 16 },
  badge: { width: 52, height: 26, borderRadius: 6, justifyContent: 'center' as const, alignItems: 'center' as const, marginRight: 10 },
  badgeCompact: { width: 48, height: 24, borderRadius: 6, justifyContent: 'center' as const, alignItems: 'center' as const, marginRight: 10 },
  badgeText: { color: '#fff', fontWeight: '800' as const, fontSize: 13 },
  badgeTextCompact: { color: '#fff', fontWeight: '800' as const, fontSize: 12 },
  image: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceMuted },
  imageCompact: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: c.surfaceMuted },
  name: { fontSize: 16, fontWeight: '700' as const, color: c.text, flexShrink: 1 },
  nameCompact: { fontSize: 15, fontWeight: '700' as const, color: c.text },
  sub: { fontSize: 13, color: c.textMuted, marginTop: 1 },
  injuryPill: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  injuryPillText: { color: '#fff', fontWeight: '800' as const, fontSize: 11 },
  injuryText: { fontSize: 12, marginBottom: 3, fontWeight: '600' as const },
  statLine: { fontSize: 12, color: c.textMuted },
  points: { width: 72, alignItems: 'flex-end' as const, marginLeft: 'auto' as const },
  denseRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, paddingVertical: 10, paddingHorizontal: 8, width: '100%' as const },
  badgeDense: { minWidth: 34, height: 20, paddingHorizontal: 4, borderRadius: 5, justifyContent: 'center' as const, alignItems: 'center' as const },
  badgeTextDense: { color: '#fff', fontWeight: '800' as const, fontSize: 10 },
  imageDense: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceMuted },
  nameDense: { fontSize: 13, fontWeight: '700' as const, color: c.text, flexShrink: 1 },
  pointsDense: { fontSize: 15, fontWeight: '800' as const, color: c.text, marginTop: 2 },
  pointsText: { fontSize: 18, fontWeight: '800' as const, textAlign: 'right' as const, color: c.text },
});
