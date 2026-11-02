// app/components/LeaguesModal.tsx
// Leagues popup: switch leagues, add one by ID or link, remove one.

import React, { useState } from 'react';
import { Pressable, View, Text, TextInput, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFantasy } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { parseLeagueId } from '../services/leagueInput';
import { radius, shadowFor, type Palette } from '../theme';
import LeagueIdHelp from './LeagueIdHelp';

/**
 * Leagues popup: switch leagues, add one by ID, remove one.
 */
export default function LeaguesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { leagues, addLeague, deleteLeague, activeLeagueId, setActiveLeagueId } = useFantasy();
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!input.trim()) return setError('Paste your Sleeper league ID or league link first.');
    const id = parseLeagueId(input);
    if (!id) return setError("That doesn't look like a league ID. It's the long number after /leagues/ in the sleeper.com address.");
    if (leagues.some(l => l.leagueId === id)) {
      setActiveLeagueId(id);
      setInput('');
      return onClose();
    }
    setAdding(true);
    setError('');
    try {
      await addLeague(id);
      setInput('');
      onClose();
    } catch {
      setError("Couldn't find that league on Sleeper. Double-check the ID.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Your leagues</Text>
              <Text style={styles.sheetSub}>Switch leagues or add another Sleeper league.</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 300 }}>
            {leagues.length === 0 && <Text style={styles.empty}>No leagues yet. Add one below.</Text>}
            {leagues.map(league => {
              const active = league.leagueId === activeLeagueId;
              return (
                <Pressable
                  key={league.leagueId}
                  style={[styles.leagueCard, active && styles.leagueCardActive]}
                  onPress={() => {
                    setActiveLeagueId(league.leagueId);
                    onClose();
                  }}
                >
                  <View style={[styles.leagueIcon, active && { backgroundColor: colors.primary }]}>
                    <Ionicons name="trophy" size={16} color={active ? colors.onPrimary : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leagueName} numberOfLines={1}>{league.name}</Text>
                    <Text style={styles.leagueId}>ID {league.leagueId}</Text>
                  </View>
                  {active && <Text style={styles.activePill}>Active</Text>}
                  <Pressable
                    onPress={() => {
                      if (confirmDelete === league.leagueId) {
                        deleteLeague(league.leagueId);
                        setConfirmDelete(null);
                      } else {
                        setConfirmDelete(league.leagueId);
                      }
                    }}
                    style={[styles.deleteBtn, confirmDelete === league.leagueId && styles.deleteBtnConfirm]}
                    accessibilityLabel={`Remove ${league.name}`}
                    hitSlop={6}
                  >
                    {confirmDelete === league.leagueId ? (
                      <Text style={styles.deleteConfirmText}>Remove?</Text>
                    ) : (
                      <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                    )}
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.addLabel}>ADD A LEAGUE</Text>
          <View style={styles.addRow}>
            <TextInput
              placeholder="League ID or sleeper.com link"
              placeholderTextColor={colors.textSubtle}
              value={input}
              onChangeText={t => {
                setInput(t);
                setError('');
              }}
              onSubmitEditing={handleAdd}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Pressable style={[styles.addBtn, adding && { opacity: 0.7 }]} onPress={handleAdd} disabled={adding}>
              {adding ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.addBtnText}>Add</Text>}
            </Pressable>
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <LeagueIdHelp />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 440, backgroundColor: c.surface, borderRadius: radius.lg, padding: 18, ...shadowFor(c) },
  sheetHeader: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '800' as const, color: c.text },
  sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  empty: { color: c.textMuted, fontSize: 13, paddingVertical: 12, textAlign: 'center' as const },
  leagueCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted, marginBottom: 8 },
  leagueCardActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
  leagueIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  leagueName: { fontSize: 15, fontWeight: '700' as const, color: c.text },
  leagueId: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  activePill: { fontSize: 11, fontWeight: '800' as const, color: c.primary, backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' as const },
  deleteBtn: { padding: 6, borderRadius: radius.sm },
  deleteBtnConfirm: { backgroundColor: c.dangerSoft },
  deleteConfirmText: { color: c.danger, fontWeight: '800' as const, fontSize: 12 },
  addLabel: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8, marginTop: 10, marginBottom: 6 },
  addRow: { flexDirection: 'row' as const, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted, color: c.text, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  addBtn: { backgroundColor: c.primary, borderRadius: radius.md, paddingHorizontal: 18, justifyContent: 'center' as const, alignItems: 'center' as const, minWidth: 64 },
  addBtnText: { color: c.onPrimary, fontWeight: '800' as const },
  error: { color: c.danger, fontSize: 12, marginTop: 6 },
});
