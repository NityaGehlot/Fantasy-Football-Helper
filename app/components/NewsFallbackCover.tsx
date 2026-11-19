// app/components/NewsFallbackCover.tsx
// The cover a news card shows when its article has no picture, or the picture won't load:
// the team's colours and logo for a one-team story, otherwise a quiet card with the source name.

import React from 'react';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedStyles } from '../context/ThemeContext';
import type { NewsFallback } from '../services/newsFallback';
import type { Palette } from '../theme';

export default function NewsFallbackCover({ fallback, height, video }: { fallback: NewsFallback; height: number; video?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  if (fallback.kind === 'team') {
    return (
      <View style={[styles.box, { height, backgroundColor: fallback.color }]} accessibilityLabel={`${fallback.team} news`}>
        <View style={styles.logoWrap}>
          <Image source={{ uri: fallback.logo }} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.teamSource} numberOfLines={1}>{fallback.source}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.box, styles.neutral, { height }]} accessibilityLabel={`${fallback.source} news`}>
      <Ionicons name={video ? 'videocam-outline' : 'newspaper-outline'} size={30} style={styles.neutralIcon} />
      <Text style={styles.neutralSource} numberOfLines={1}>{fallback.source}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  box: { width: '100%' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  logoWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center' as const, justifyContent: 'center' as const },
  logo: { width: 46, height: 46 },
  teamSource: { color: '#fff', fontSize: 12, fontWeight: '700' as const, opacity: 0.9, paddingHorizontal: 12 },
  neutral: { backgroundColor: c.surfaceMuted },
  neutralIcon: { color: c.textMuted },
  neutralSource: { color: c.textMuted, fontSize: 12, fontWeight: '700' as const, paddingHorizontal: 12 },
});
