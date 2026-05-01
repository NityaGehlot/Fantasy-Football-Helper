// AppNavigator.tsx
import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Menu, Provider as PaperProvider } from 'react-native-paper';
import { Pressable, View, Text, TextInput, Modal, StyleSheet } from 'react-native';
import { signOut } from 'firebase/auth';

import HomeScreen from './screens/HomeScreen';
import FantasyScreen from './screens/FantasyScreen';
import ChatBotScreen from './screens/ChatBotScreen';
import MaddenScreen from './screens/MaddenScreen';
import PlayerDetailsScreen from "./screens/PlayerDetailsScreen";

import { FantasyProvider, useFantasy } from './context/FantasyContext';
import { auth } from './services/firebase';

const Tab = createBottomTabNavigator();

/**
 * ============================
 * NAVIGATION TYPE DEFINITIONS
 * ============================
 */

export type RootStackParamList = {
  MainTabs: undefined;
  PlayerDetails: {
    player: any;
    stats: any;
    week: number;
    fantasyPoints: number;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * League type (matches FantasyContext)
 */
type League = {
  leagueId: string;
  name: string;
};

/**
 * Top-right account menu component
 */
function AccountMenu() {
  const [visible, setVisible] = useState(false);
  const [showLeagues, setShowLeagues] = useState(false);
  const [input, setInput] = useState("");

  const {
    leagues,
    addLeague,
    deleteLeague,
    setActiveLeagueId
  } = useFantasy();

  const closeMenu = () => setVisible(false);

  const handleAddLeague = async () => {
    if (!input.trim()) return;
    await addLeague(input.trim());
    setInput("");
    setShowLeagues(false);
  };

  return (
    <>
      <Menu
        visible={visible}
        onDismiss={closeMenu}
        anchor={
          <Pressable onPress={() => setVisible(true)} style={{ marginRight: 12 }}>
            <Ionicons name="person-circle-outline" size={28} color="black" />
          </Pressable>
        }
      >
        <Menu.Item
          onPress={() => {
            closeMenu();
            setShowLeagues(true);
          }}
          title="Leagues"
        />
        <Menu.Item onPress={() => signOut(auth)} title="Log Out" />
      </Menu>

      {/* ===== LEAGUES MODAL ===== */}
      <Modal visible={showLeagues} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Your Sleeper Leagues</Text>

            <TextInput
              placeholder="Enter League ID"
              value={input}
              onChangeText={setInput}
              style={styles.modalInput}
            />

            <Pressable style={styles.addBtn} onPress={handleAddLeague}>
              <Text style={{ color: "#fff" }}>Add League</Text>
            </Pressable>

            {leagues.map((league: League) => (
              <Pressable
                key={league.leagueId}
                style={styles.leagueRow}
                onPress={() => {
                  setActiveLeagueId(league.leagueId);
                  setShowLeagues(false);
                }}
              >
                <Text style={{ fontWeight: "600" }}>{league.name}</Text>
                <Text style={{ fontSize: 12, color: "#666" }}>
                  {league.leagueId}
                </Text>

                <Pressable
                  onPress={() => deleteLeague(league.leagueId)}
                  style={{ marginTop: 4 }}
                >
                  <Text style={{ color: "#ef4444", fontSize: 12 }}>
                    Delete
                  </Text>
                </Pressable>
              </Pressable>
            ))}

            <Pressable onPress={() => setShowLeagues(false)}>
              <Text style={{ marginTop: 10, color: "#3b82f6" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * Bottom Tab Navigator
 */
function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerRight: () => <AccountMenu />,
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          switch (route.name) {
            case 'Home':
              iconName = 'home';
              break;
            case 'Fantasy':
              iconName = 'american-football';
              break;
            case 'ChatBot':
              iconName = 'chatbubble-ellipses';
              break;
            case 'Madden':
              iconName = 'game-controller';
              break;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Fantasy" component={FantasyScreen} />
      <Tab.Screen name="ChatBot" component={ChatBotScreen} />
      {/* <Tab.Screen name="Madden" component={MaddenScreen} /> */}
    </Tab.Navigator>
  );
}

/**
 * =====================
 * Main App navigator
 * =====================
 */
export default function AppNavigator() {
  return (
    <PaperProvider>
      <NavigationContainer>
        <FantasyProvider>

          <Stack.Navigator>

            {/* Tabs */}
            <Stack.Screen
              name="MainTabs"
              component={TabNavigator}
              options={{ headerShown: false }}
            />

            {/* Player Details */}
            <Stack.Screen
              name="PlayerDetails"
              component={PlayerDetailsScreen}
              options={{ title: "Player Details" }}
            />

          </Stack.Navigator>

        </FantasyProvider>
      </NavigationContainer>
    </PaperProvider>
  );
}

/**
 * =====================
 * Styles
 * =====================
 */
const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center"
  },
  modalCard: {
    width: 360,
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10
  },
  addBtn: {
    backgroundColor: "#4f46e5",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12
  },
  leagueRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee"
  }
});