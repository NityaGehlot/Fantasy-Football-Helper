import React, { useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Keyboard
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFantasy } from "../context/FantasyContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { radius, shadowFor, type Palette } from "../theme";

const BLANK = "____";

// One-tap questions covering each kind of advice the assistant can give. Templates with
// blanks fill the input box instead of sending, so you can type the player names.
const SUGGESTIONS: { label: string; icon: keyof typeof Ionicons.glyphMap; text: string; template?: boolean }[] = [
  { label: "Set my lineup", icon: "list", text: "Who should I start this week?" },
  { label: "Compare players", icon: "git-compare-outline", text: `Should I start ${BLANK} or ${BLANK} this week?`, template: true },
  { label: "Waiver pickups", icon: "add-circle-outline", text: "Who are the best waiver pickups for my team?" },
  { label: "Trade ideas", icon: "swap-horizontal", text: "Who should I trade for?" },
  { label: "Who to draft", icon: "podium-outline", text: "Who should I draft next?" },
];

export default function ChatBotScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const {
    chatMessages,
    isChatTyping,
    sendChatMessage,
    markChatAsRead,
    chatPersistenceEnabled,
    setChatPersistenceEnabled,
    clearChatHistory,
    myTeam
  } = useFantasy();

  const [input, setInput] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const scrollRef = useRef<ScrollView | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      markChatAsRead();
    }, [chatMessages.length, markChatAsRead])
  );

  const hasBlank = input.includes(BLANK);

  // Highlight the next ____ so typing a name replaces it.
  const selectNextBlank = (text: string, from = 0) => {
    const at = text.indexOf(BLANK, from);
    const idx = at >= 0 ? at : text.indexOf(BLANK);
    if (idx < 0) return setSelection(undefined);
    setSelection({ start: idx, end: idx + BLANK.length });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isChatTyping || trimmed.includes(BLANK)) return;

    Keyboard.dismiss();
    setInput("");
    setSelection(undefined);
    await sendChatMessage(trimmed);
  };

  const useSuggestion = (s: (typeof SUGGESTIONS)[number]) => {
    if (s.template) {
      setInput(s.text);
      selectNextBlank(s.text);
    } else {
      send(s.text);
    }
  };

  // Enter sends (web); Tab jumps to the next blank in a template.
  const handleKeyPress = (e: any) => {
    const key = e.nativeEvent.key;
    if (key === "Tab" && hasBlank) {
      e.preventDefault?.();
      selectNextBlank(input, (selection?.end ?? 0));
    } else if (key === "Enter") {
      send(input);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={[styles.contextPill, !myTeam && styles.contextPillWarn]}>
          <Ionicons
            name={myTeam ? "shield-checkmark" : "alert-circle"}
            size={14}
            color={myTeam ? colors.success : colors.warning}
          />
          <Text style={styles.contextText} numberOfLines={1}>
            {myTeam ? `Advising: ${myTeam.teamName}` : "No team set — pick one on the Fantasy tab"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.optionBtn}
          onPress={() => setChatPersistenceEnabled(!chatPersistenceEnabled)}
          accessibilityLabel={chatPersistenceEnabled ? "Turn chat history off" : "Turn chat history on"}
        >
          <Ionicons name={chatPersistenceEnabled ? "bookmark" : "bookmark-outline"} size={14} color={colors.text} />
          <Text style={styles.optionBtnText}>{chatPersistenceEnabled ? "Saving" : "Not saving"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionBtn} onPress={clearChatHistory} disabled={isChatTyping} accessibilityLabel="Clear chat">
          <Ionicons name="trash-outline" size={14} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {chatMessages.length === 0 && (
          <View style={styles.welcome}>
            <View style={styles.welcomeIcon}>
              <Ionicons name="sparkles" size={26} color={colors.primary} />
            </View>
            <Text style={styles.welcomeTitle}>Your fantasy assistant</Text>
            <Text style={styles.welcomeText}>
              Ask who to start or bench, who to pick up and drop, who to trade for, or who to draft.
              Answers use this season's stats and your Sleeper roster.
            </Text>
          </View>
        )}

        {chatMessages.map(m => {
          const isUser = m.role === "user";
          const isPending = !isUser && m.text === "" && isChatTyping;
          return (
            <View key={m.id} style={[styles.row, isUser ? styles.rowUser : styles.rowBot]}>
              {!isUser && (
                <View style={styles.avatar}>
                  <Ionicons name="sparkles" size={14} color={colors.onPrimary} />
                </View>
              )}
              <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
                <Text style={isUser ? styles.userText : styles.botText} selectable>
                  {isPending ? "Thinking…" : m.text}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.suggestions}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {SUGGESTIONS.map(s => (
          <TouchableOpacity
            key={s.label}
            style={[styles.suggestion, isChatTyping && { opacity: 0.5 }]}
            onPress={() => useSuggestion(s)}
            disabled={isChatTyping}
          >
            <Ionicons name={s.icon} size={14} color={colors.primary} />
            <Text style={styles.suggestionText}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {hasBlank && <Text style={styles.blankHint}>Replace each ____ with a player name (Tab jumps to the next one).</Text>}

      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={t => {
            setInput(t);
            setSelection(undefined);
          }}
          selection={selection}
          onSelectionChange={() => selection && setSelection(undefined)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about lineups, waivers, trades, or the draft…"
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
          multiline={false}
        />
        <TouchableOpacity
          onPress={() => send(input)}
          style={[styles.sendBtn, (isChatTyping || !input.trim() || hasBlank) && { opacity: 0.5 }]}
          disabled={isChatTyping || hasBlank}
          accessibilityLabel="Send"
        >
          <Ionicons name="send" size={18} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  container: { flex: 1, padding: 12, backgroundColor: c.background },
  toolbar: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, marginBottom: 6 },
  contextPill: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 6, backgroundColor: c.successSoft, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 10 },
  contextPillWarn: { backgroundColor: c.warningSoft },
  contextText: { flex: 1, fontSize: 12, fontWeight: "600" as const, color: c.text },
  optionBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingVertical: 6, paddingHorizontal: 10 },
  optionBtnText: { color: c.text, fontSize: 12, fontWeight: "600" as const },
  chat: { flex: 1 },
  welcome: { alignItems: "center" as const, padding: 24, gap: 8 },
  welcomeIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: c.primarySoft, alignItems: "center" as const, justifyContent: "center" as const },
  welcomeTitle: { fontSize: 18, fontWeight: "800" as const, color: c.text },
  welcomeText: { fontSize: 14, color: c.textMuted, textAlign: "center" as const, lineHeight: 20, maxWidth: 420 },
  row: { flexDirection: "row" as const, alignItems: "flex-end" as const, marginVertical: 4 },
  rowUser: { justifyContent: "flex-end" as const },
  rowBot: { justifyContent: "flex-start" as const },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.primary, alignItems: "center" as const, justifyContent: "center" as const, marginRight: 6 },
  bubble: { maxWidth: "82%" as const, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.lg },
  userBubble: { backgroundColor: c.primary, borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: c.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.border, ...shadowFor(c) },
  userText: { color: c.onPrimary, fontSize: 15, lineHeight: 21 },
  botText: { color: c.text, fontSize: 14, lineHeight: 21 },
  suggestions: { flexGrow: 0, marginBottom: 8 },
  suggestion: { flexDirection: "row" as const, alignItems: "center" as const, gap: 5, backgroundColor: c.primarySoft, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  suggestionText: { color: c.primary, fontWeight: "700" as const, fontSize: 13 },
  blankHint: { fontSize: 12, color: c.textMuted, marginBottom: 6, marginLeft: 4 },
  inputRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  input: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.pill, fontSize: 15, color: c.text },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.primary, alignItems: "center" as const, justifyContent: "center" as const },
});
