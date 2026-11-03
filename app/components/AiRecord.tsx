// app/components/AiRecord.tsx
// The AI's start/sit record ("7-3, 70% right"): every "start A or B?" call it made, and after
// the games whether the player it picked actually scored more.

import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFantasy } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { summarizeRecord } from '../services/aiRecord';
import { radius, shadowFor, type Palette } from '../theme';

export default function AiRecord() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { aiCalls } = useFantasy();
  const [open, setOpen] = useState(false);
  const r = summarizeRecord(aiCalls);
  const label = r.right + r.wrong + r.push > 0 ? `AI record ${r.right}-${r.wrong}${r.push ? `-${r.push}` : ''}${r.pct !== null ? ` · ${r.pct}%` : ''}` : aiCalls.length ? `AI record: ${r.pending} pending` : 'AI record';

  return (
    <>
      <Pressable style={styles.pill} onPress={() => setOpen(true)} accessibilityLabel="The AI's start/sit record">
        <Ionicons name="ribbon-outline" size={14} color={colors.primary} />
        <Text style={styles.pillText}>{label}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation?.()}>
            <View style={styles.header}>
              <Text style={styles.title}>The AI's start/sit record</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.sub}>
              Each time you ask "start A or B?", the pick is saved. After that week's games (stats arrive Tuesdays) it's
              graded: right if the player it picked scored more PPR points.
            </Text>
            <View style={styles.summary}>
              {[['Right', r.right, colors.success], ['Wrong', r.wrong, colors.danger], ['Pending', r.pending, colors.textMuted]].map(([l, n, c]) => (
                <View key={String(l)} style={styles.box}>
                  <Text style={[styles.boxValue, { color: c as string }]}>{n as number}</Text>
                  <Text style={styles.boxLabel}>{l}</Text>
                </View>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {aiCalls.length === 0 && <Text style={styles.sub}>No calls yet. Ask "Should I start A or B this week?" on this screen.</Text>}
              {[...aiCalls].reverse().map(c => (
                <View key={c.id} style={styles.row}>
                  <Ionicons
                    name={c.result === 'right' ? 'checkmark-circle' : c.result === 'wrong' ? 'close-circle' : c.result === 'push' ? 'remove-circle' : 'time-outline'}
                    size={18}
                    color={c.result === 'right' ? colors.success : c.result === 'wrong' ? colors.danger : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.call}>Start {c.pick} over {c.other}</Text>
                    <Text style={styles.meta}>
                      Week {c.week}, {c.season}
                      {c.result ? ` · ${c.pick} ${c.pickPoints?.toFixed(1)} vs ${c.other} ${c.otherPoints?.toFixed(1)}` : ' · waiting for the games'}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: Palette) => ({
  pill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: c.primarySoft, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 10 },
  pillText: { color: c.primary, fontWeight: '700' as const, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 460, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, gap: 10, ...shadowFor(c) },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const },
  title: { flex: 1, fontSize: 19, fontWeight: '800' as const, color: c.text },
  sub: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
  summary: { flexDirection: 'row' as const, gap: 8 },
  box: { flex: 1, backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 10, alignItems: 'center' as const },
  boxValue: { fontSize: 22, fontWeight: '800' as const },
  boxLabel: { fontSize: 11, color: c.textMuted },
  row: { flexDirection: 'row' as const, gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border, alignItems: 'center' as const },
  call: { fontSize: 14, fontWeight: '700' as const, color: c.text },
  meta: { fontSize: 12, color: c.textMuted, marginTop: 1 },
});
