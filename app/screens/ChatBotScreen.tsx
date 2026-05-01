import React, { useState } from "react";
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
  const { playerStats2025, matchups } = useFantasy();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || isTyping) return;

    Keyboard.dismiss(); // hide keyboard
    const userMsg = { role: "user", text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true); // disable send button

    // Start empty bot bubble
    setMessages(prev => [...prev, { role: "bot", text: "" }]);

    try {
      console.log("Sending playerStats length:", playerStats2025?.length);

      const response = await fetch("http://127.0.0.1:4000/fantasy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.text,
          // playerStats: playerStats2025,
          // matchupData: matchups
        })
      });

      const data = await response.json();

      // Typing effect
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].text = data.reply.slice(0, i);
          return updated;
        });

        if (i >= (data.reply || "").length) {
          clearInterval(interval);
          setIsTyping(false); // enable send button
        }
      }, 15); // adjust speed here

    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        { role: "bot", text: "⚠️ Failed to reach AI." }
      ]);
      setIsTyping(false);
    }
  };

  // Allow Enter key to send message (web only)
  const handleKeyPress = (e: any) => {
    if (e.nativeEvent.key === "Enter") sendMessage();
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.chat}>
        {messages.map((m, i) => (
          <Text
            key={i}
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
          style={[styles.sendBtn, isTyping && { opacity: 0.5 }]}
          disabled={isTyping}
        >
          <Text style={{ color: "#fff" }}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#fff" },
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
