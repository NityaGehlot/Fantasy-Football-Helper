// app/components/HelpAssistant.tsx
// "?" in the top bar: ask how anything in the app works. Answers come from the app guide
// (worded by the AI when it's running) with buttons that take you to the right screen.

import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { askAppHelp } from '../services/appHelp';
import { GUIDE, type GuideTopic } from '../services/appGuide';
import { openTutorial } from '../services/onboarding';
import { openTab } from '../navigationRef';
import { radius, shadowFor, type Palette } from '../theme';

type Msg = { role: 'user' | 'help'; text: string; topics?: GuideTopic[] };

const STARTERS = ['How do I add my league?', 'What do the win odds mean?', 'How does IR work?', 'How do I get start/sit advice?', 'How do notifications work?'];

export default function HelpAssistant() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const scroll = useRef<ScrollView | null>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text: question }]);
    setBusy(true);
    const answer = await askAppHelp(question);
    setMsgs(m => [...m, { role: 'help', text: answer.text, topics: answer.topics }]);
    setBusy(false);
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ marginRight: 8, padding: 2 }} accessibilityLabel="Help: how to use the app">
        <Ionicons name="help-circle-outline" size={25} color={colors.text} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation?.()}>
            <View style={styles.header}>
              <Ionicons name="compass" size={20} color={colors.primary} />
              <Text style={styles.title}>App help</Text>
              <Pressable
                onPress={() => {
                  setOpen(false);
                  openTutorial();
                }}
                hitSlop={6}
              >
                <Text style={styles.tour}>Take the tour</Text>
              </Pressable>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView ref={scroll} style={{ maxHeight: 400 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
              {msgs.length === 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={styles.intro}>Ask how anything in the app works, or pick a question:</Text>
                  {STARTERS.map(s => (
                    <Pressable key={s} style={styles.starter} onPress={() => ask(s)}>
                      <Text style={styles.starterText}>{s}</Text>
                    </Pressable>
                  ))}
                  <Text style={[styles.intro, { marginTop: 8 }]}>Topics: {GUIDE.map(g => g.title).join(' · ')}</Text>
                </View>
              )}
              {msgs.map((m, i) => (
                <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.helpBubble]}>
                  <Text style={m.role === 'user' ? styles.userText : styles.helpText}>{m.text}</Text>
                  {m.topics
                    ?.filter(t => t.screen)
                    .slice(0, 2)
                    .map(t => (
                      <Pressable
                        key={t.id}
                        style={styles.go}
                        onPress={() => {
                          setOpen(false);
                          openTab(t.screen!);
                        }}
                      >
                        <Ionicons name="arrow-forward-circle" size={15} color={colors.primary} />
                        <Text style={styles.goText}>{t.goLabel ?? `Go to ${t.screen}`}</Text>
                      </Pressable>
                    ))}
                </View>
              ))}
              {busy && <ActivityIndicator style={{ padding: 8 }} />}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => ask(input)}
                placeholder="e.g. How do I see my win odds?"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
              />
              <Pressable style={[styles.send, (!input.trim() || busy) && { opacity: 0.5 }]} onPress={() => ask(input)} disabled={!input.trim() || busy} accessibilityLabel="Ask">
                <Ionicons name="send" size={16} color={colors.onPrimary} />
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: Palette) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 460, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, ...shadowFor(c) },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 10 },
  title: { flex: 1, fontSize: 19, fontWeight: '800' as const, color: c.text },
  tour: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  intro: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
  starter: { backgroundColor: c.primarySoft, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 12 },
  starterText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  bubble: { borderRadius: radius.md, padding: 10, marginVertical: 4, maxWidth: '92%' as const },
  userBubble: { alignSelf: 'flex-end' as const, backgroundColor: c.primary },
  helpBubble: { alignSelf: 'flex-start' as const, backgroundColor: c.surfaceMuted },
  userText: { color: c.onPrimary, fontSize: 14 },
  helpText: { color: c.text, fontSize: 14, lineHeight: 20 },
  go: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginTop: 8 },
  goText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  inputRow: { flexDirection: 'row' as const, gap: 8, marginTop: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted, color: c.text, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
});
