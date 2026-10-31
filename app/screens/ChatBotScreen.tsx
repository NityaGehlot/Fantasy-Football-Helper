import React, { useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Keyboard
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFantasy } from "../context/FantasyContext";
import { colors, radius, shadow } from "../theme";

// One-tap questions covering each kind of advice the assistant can give.
const SUGGESTIONS = [
  { label: "Set my lineup", icon: "list", text: "Who should I start this week?" },
  { label: "Waiver pickups", icon: "add-circle-outline", text: "Who are the best waiver pickups for my team?" },
  { label: "Trade ideas", icon: "swap-horizontal", text: "Who should I trade for?" },
  { label: "Who to draft", icon: "podium-outline", text: "Who should I draft next?" },
  { label: "Which QB?", icon: "american-football-outline", text: "Which QB should I start?" },
] as const;

export default function ChatBotScreen() {
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
  const scrollRef = useRef<ScrollView | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      markChatAsRead();
    }, [chatMessages.length, markChatAsRead])
  );

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isChatTyping) return;

    Keyboard.dismiss();
    setInput("");
    await sendChatMessage(trimmed);
  };

  // Allow Enter key to send message (web only)
  const handleKeyPress = (e: any) => {
    if (e.nativeEvent.key === "Enter") send(input);
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
        >
          <Text style={styles.optionBtnText}>
            {chatPersistenceEnabled ? "History: On" : "History: Off"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionBtn}
          onPress={clearChatHistory}
          disabled={isChatTyping}
        >
          <Text style={styles.optionBtnText}>Clear</Text>
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
            <Ionicons name="sparkles" size={28} color={colors.primary} />
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
                  <Ionicons name="sparkles" size={14} color="#fff" />
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
            onPress={() => send(s.text)}
            disabled={isChatTyping}
          >
            <Ionicons name={s.icon} size={14} color={colors.primary} />
            <Text style={styles.suggestionText}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onKeyPress={handleKeyPress} // for web enter-to-send
          placeholder="Ask about lineups, waivers, trades, or the draft…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <TouchableOpacity
          onPress={() => send(input)}
          style={[styles.sendBtn, (isChatTyping || !input.trim()) && { opacity: 0.5 }]}
          disabled={isChatTyping}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: colors.background },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  contextPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  contextPillWarn: { backgroundColor: colors.warningSoft },
  contextText: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.text },
  optionBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  optionBtnText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chat: { flex: 1 },
  welcome: { alignItems: "center", padding: 24, gap: 8 },
  welcomeTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  welcomeText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "flex-end", marginVertical: 4 },
  rowUser: { justifyContent: "flex-end" },
  rowBot: { justifyContent: "flex-start" },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6
  },
  bubble: { maxWidth: "82%", paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.lg },
  userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, ...shadow },
  userText: { color: "#fff", fontSize: 15, lineHeight: 21 },
  botText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  suggestions: { flexGrow: 0, marginBottom: 8 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 12
  },
  suggestionText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    fontSize: 15,
    color: colors.text
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  }
});
