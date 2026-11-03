// app/components/StartSitPicker.tsx
// Two-step picker for start/sit questions: pick a player from your team, then pick someone
// who could take his lineup spot. Players who can't play that spot are listed separately
// with the reason, so you know who he can be compared with.

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FantasyTeamPlayer, MyFantasyTeam } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { describeSlots, startSitQuestion, swapOptions } from '../services/startSit';
import { getPositionColor, radius, shadowFor, type Palette } from '../theme';

const ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

export default function StartSitPicker({
  visible,
  team,
  onClose,
  onAsk,
  onTypeOwn,
}: {
  visible: boolean;
  team: MyFantasyTeam | null;
  onClose: () => void;
  // Send the finished question
  onAsk: (question: string) => void;
  // Put a question with a blank in the input box (to compare with someone not on your team)
  onTypeOwn: (template: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [first, setFirst] = useState<FantasyTeamPlayer | null>(null);

  const roster = useMemo(
    () =>
      [...(team?.players ?? [])]
        .filter(p => ORDER.includes(p.position))
        .sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || Number(b.isStarter) - Number(a.isStarter) || a.fullName.localeCompare(b.fullName)),
    [team]
  );
  // Players in IR spots can't be started, so they aren't offered as swaps.
  const onIr = new Set(team?.reserve ?? []);
  const swaps = first ? swapOptions(first, roster, team?.rosterPositions) : null;
  const options = swaps
    ? { eligible: swaps.eligible.filter(o => !onIr.has(o.player.playerId)), ineligible: swaps.ineligible, ir: swaps.eligible.filter(o => onIr.has(o.player.playerId)).map(o => o.player) }
    : null;

  const close = () => {
    setFirst(null);
    onClose();
  };

  const Row = ({ p, onPress, disabled, note }: { p: FantasyTeamPlayer; onPress?: () => void; disabled?: boolean; note?: string }) => (
    <Pressable style={[styles.row, disabled && { opacity: 0.55 }]} onPress={onPress} disabled={disabled}>
      <View style={[styles.pos, { backgroundColor: getPositionColor(p.position) }]}>
        <Text style={styles.posText}>{p.position}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>{p.fullName}</Text>
        <Text style={styles.sub} numberOfLines={2}>{note ?? `${p.team || 'FA'}${p.isStarter ? ' · starting' : onIr.has(p.playerId) ? ' · IR' : ' · bench'}`}</Text>
      </View>
      {!disabled && <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />}
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation?.()}>
          <View style={styles.header}>
            {first && (
              <Pressable onPress={() => setFirst(null)} hitSlop={8} accessibilityLabel="Back">
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </Pressable>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{first ? `Start ${first.fullName} or…` : 'Who are you deciding on?'}</Text>
              <Text style={styles.subtitle}>
                {first
                  ? `Only players who can play his spot (${describeSlots(first.position, team?.rosterPositions)}) are listed first.`
                  : 'Pick a player from your team.'}
              </Text>
            </View>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {!team ? (
            <Text style={styles.empty}>Set your team on the Fantasy tab first ("Make … my team"), then come back.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 440 }}>
              {!first &&
                roster.map(p => <Row key={p.playerId} p={p} onPress={() => setFirst(p)} />)}

              {first && options && (
                <>
                  {options.eligible.length === 0 ? (
                    <View style={styles.notice}>
                      <Ionicons name="information-circle" size={16} color={colors.warning} />
                      <Text style={styles.noticeText}>
                        Nobody else on your roster can play {describeSlots(first.position, team.rosterPositions)}, so there's no
                        one to swap him with. You can still compare him with a free agent.
                      </Text>
                    </View>
                  ) : (
                    options.eligible.map(({ player, slots }) => (
                      <Row
                        key={player.playerId}
                        p={player}
                        note={`${player.team || 'FA'} · can play ${slots.join(' / ')}${player.isStarter ? ' · starting' : ' · bench'}`}
                        onPress={() => {
                          onAsk(startSitQuestion(first.fullName, player.fullName));
                          close();
                        }}
                      />
                    ))
                  )}

                  <Pressable
                    style={styles.typeOwn}
                    onPress={() => {
                      onTypeOwn(startSitQuestion(first.fullName, '____'));
                      close();
                    }}
                  >
                    <Ionicons name="create-outline" size={15} color={colors.primary} />
                    <Text style={styles.typeOwnText}>Compare with someone not on my team</Text>
                  </Pressable>

                  {options.ir.length > 0 && (
                    <>
                      <Text style={styles.section}>IN AN IR SPOT</Text>
                      {options.ir.map(p => (
                        <Row key={p.playerId} p={p} disabled note="In your IR spot, so he can't be started until you move him back" />
                      ))}
                    </>
                  )}

                  {options.ineligible.length > 0 && (
                    <>
                      <Text style={styles.section}>CAN'T TAKE HIS SPOT</Text>
                      {options.ineligible.map(p => (
                        <Row
                          key={p.playerId}
                          p={p}
                          disabled
                          note={`A ${p.position} can only play ${describeSlots(p.position, team.rosterPositions)}`}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: Palette) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 460, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, ...shadowFor(c) },
  header: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '800' as const, color: c.text },
  subtitle: { fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 17 },
  empty: { color: c.textMuted, fontSize: 13, paddingVertical: 16, textAlign: 'center' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 9, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: c.border },
  pos: { width: 40, height: 22, borderRadius: 5, alignItems: 'center' as const, justifyContent: 'center' as const },
  posText: { color: '#fff', fontWeight: '800' as const, fontSize: 11 },
  name: { fontSize: 15, fontWeight: '700' as const, color: c.text },
  sub: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  section: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8, marginTop: 14, marginBottom: 2 },
  notice: { flexDirection: 'row' as const, gap: 8, backgroundColor: c.warningSoft, borderRadius: radius.md, padding: 10, marginBottom: 6 },
  noticeText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 18 },
  typeOwn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: 12, paddingHorizontal: 6 },
  typeOwnText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
});
