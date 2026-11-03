// app/components/Tutorial.tsx
// First-run tour: shown automatically to new users (no leagues saved yet) and any time from
// Help → "Take the tour". Ends with a button to add your league.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFantasy } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { auth } from '../services/firebase';
import { TUTORIAL_STEPS } from '../services/appGuide';
import { finishTutorial, openTutorial, shouldAutoStart, tutorialDone, useTutorialVisible } from '../services/onboarding';
import LeaguesModal from './LeaguesModal';
import LeagueIdHelp from './LeagueIdHelp';
import { radius, shadowFor, type Palette } from '../theme';

export default function Tutorial() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const visible = useTutorialVisible();
  const { leagues, leaguesLoaded } = useFantasy();
  const [step, setStep] = useState(0);
  const [showLeagues, setShowLeagues] = useState(false);
  const uid = auth.currentUser?.uid ?? 'anon';

  // Start the tour for new accounts once we know they have no leagues.
  useEffect(() => {
    let cancelled = false;
    if (!leaguesLoaded) return;
    tutorialDone(uid).then(done => {
      if (!cancelled && shouldAutoStart(done, leaguesLoaded, leagues.length)) {
        setStep(0);
        openTutorial();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [leaguesLoaded, uid]);

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const s = TUTORIAL_STEPS[step];
  const last = step === TUTORIAL_STEPS.length - 1;
  const done = (addLeague = false) => {
    finishTutorial(uid);
    if (addLeague) setShowLeagues(true);
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => done()}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.progress}>
              {TUTORIAL_STEPS.map((_, i) => (
                <View key={i} style={[styles.dot, i <= step && { backgroundColor: colors.primary }]} />
              ))}
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ alignItems: 'center', gap: 12 }}>
              <View style={styles.icon}>
                <Ionicons name={s.icon as any} size={30} color={colors.primary} />
              </View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
              {s.topic === 'add-league' && <LeagueIdHelp />}
            </ScrollView>
            <View style={styles.buttons}>
              {step > 0 ? (
                <Pressable style={styles.secondary} onPress={() => setStep(step - 1)}>
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.secondary} onPress={() => done()}>
                  <Text style={styles.secondaryText}>Skip tour</Text>
                </Pressable>
              )}
              {last ? (
                <Pressable style={styles.primary} onPress={() => done(leagues.length === 0)}>
                  <Text style={styles.primaryText}>{leagues.length === 0 ? 'Add my league' : 'Done'}</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.primary} onPress={() => setStep(step + 1)}>
                  <Text style={styles.primaryText}>Next</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.count}>
              {step + 1} of {TUTORIAL_STEPS.length}
            </Text>
          </View>
        </View>
      </Modal>
      <LeaguesModal visible={showLeagues} onClose={() => setShowLeagues(false)} />
    </>
  );
}

const makeStyles = (c: Palette) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 440, backgroundColor: c.surface, borderRadius: radius.lg, padding: 20, ...shadowFor(c) },
  progress: { flexDirection: 'row' as const, gap: 5, justifyContent: 'center' as const, marginBottom: 16 },
  dot: { width: 22, height: 4, borderRadius: 2, backgroundColor: c.border },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  title: { fontSize: 20, fontWeight: '800' as const, color: c.text, textAlign: 'center' as const },
  body: { fontSize: 14, color: c.textMuted, lineHeight: 21, textAlign: 'center' as const },
  buttons: { flexDirection: 'row' as const, gap: 10, marginTop: 18 },
  primary: { flex: 1, backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' as const },
  primaryText: { color: c.onPrimary, fontWeight: '800' as const, fontSize: 15 },
  secondary: { flex: 1, backgroundColor: c.surfaceMuted, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' as const },
  secondaryText: { color: c.text, fontWeight: '700' as const, fontSize: 15 },
  count: { textAlign: 'center' as const, color: c.textSubtle, fontSize: 12, marginTop: 10 },
});
