// app/components/LeagueIdHelp.tsx
// Step-by-step help for finding a Sleeper league ID on sleeper.com.

import React from 'react';
import { View, Text } from 'react-native';
import { useThemedStyles } from '../context/ThemeContext';
import { LEAGUE_ID_STEPS } from '../services/leagueInput';
import { radius, type Palette } from '../theme';

export default function LeagueIdHelp({ align = 'left' }: { align?: 'left' | 'center' }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.box}>
      <Text style={[styles.title, { textAlign: align }]}>How to find your league ID</Text>
      {LEAGUE_ID_STEPS.map((step, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.num}>{i + 1}</Text>
          <Text style={styles.step}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  box: { width: '100%' as const, backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 12, marginTop: 10, gap: 6 },
  title: { fontSize: 12, fontWeight: '800' as const, color: c.text },
  row: { flexDirection: 'row' as const, gap: 8, alignItems: 'flex-start' as const },
  num: { width: 18, height: 18, borderRadius: 9, backgroundColor: c.primary, color: c.onPrimary, fontSize: 11, fontWeight: '800' as const, textAlign: 'center' as const, lineHeight: 18, overflow: 'hidden' as const },
  step: { flex: 1, fontSize: 12, color: c.textMuted, lineHeight: 17 },
});
