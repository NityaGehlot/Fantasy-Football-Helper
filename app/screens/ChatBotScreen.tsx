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
import { useFantasy } from "../context/FantasyContext";

export default function ChatBotScreen() {
  const {
    chatMessages,
    isChatTyping,
    sendChatMessage,
    markChatAsRead,
    chatPersistenceEnabled,
    setChatPersistenceEnabled,
    clearChatHistory
  } = useFantasy();

  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      markChatAsRead();
    }, [chatMessages.length, markChatAsRead])
  );

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isChatTyping) return;

    Keyboard.dismiss();
    setInput("");
    await sendChatMessage(trimmed);
  };

  // Allow Enter key to send message (web only)
  const handleKeyPress = (e: any) => {
    if (e.nativeEvent.key === "Enter") sendMessage();
  };

  return (
    <View style={styles.container}>
      <View style={styles.chatOptionsRow}>
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
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {chatMessages.map(m => (
          <Text
            key={m.id}
            style={m.role === "user" ? styles.userMsg : styles.botMsg}
          >
            {m.text}
          </Text>
        ))}
      </ScrollView>

      <View style={styles.row}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onKeyPress={handleKeyPress} // for web enter-to-send
          placeholder="Ask lineup/start-sit advice..."
          style={styles.input}
        />
        <TouchableOpacity
          onPress={sendMessage}
          style={[styles.sendBtn, isChatTyping && { opacity: 0.5 }]}
          disabled={isChatTyping}
        >
          <Text style={{ color: "#fff" }}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#fff" },
  chatOptionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  optionBtn: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  optionBtnText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600"
  },
  chat: { flex: 1, marginBottom: 10 },
  userMsg: {
    alignSelf: "flex-end",
    backgroundColor: "#4f46e5",
    color: "#fff",
    padding: 10,
    borderRadius: 8,
    margin: 4
  },
  botMsg: {
    alignSelf: "flex-start",
    backgroundColor: "#eee",
    padding: 10,
    borderRadius: 8,
    margin: 4
  },
  row: { flexDirection: "row" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#aaa",
    marginRight: 8,
    padding: 8,
    borderRadius: 6
  },
  sendBtn: {
    backgroundColor: "#4f46e5",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6
  }
});
