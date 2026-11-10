// AppNavigator.tsx
import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, NavigatorScreenParams, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Menu, Divider } from 'react-native-paper';
import { Pressable, View, Text } from 'react-native';
import { signOut } from 'firebase/auth';

import HomeScreen from './screens/HomeScreen';
import FantasyScreen from './screens/FantasyScreen';
import ChatBotScreen from './screens/ChatBotScreen';
import PlayerDetailsScreen from "./screens/PlayerDetailsScreen";
import DefenseRosterScreen from "./screens/DefenseRosterScreen";
import ComparePlayerScreen from "./screens/ComparePlayerScreen";
import TradeIdeasScreen from "./screens/TradeIdeasScreen";
import FollowingScreen from "./screens/FollowingScreen";
import LeaguesModal from './components/LeaguesModal';
import NotificationBell from './components/NotificationBell';
import HelpAssistant from './components/HelpAssistant';
import Tutorial from './components/Tutorial';
import { openTutorial } from './services/onboarding';
import { navigationRef } from './navigationRef';
import { NotificationProvider } from './context/NotificationContext';

import { FantasyProvider, useFantasy } from './context/FantasyContext';
import { useTheme, useThemedStyles, type ThemeMode } from './context/ThemeContext';
import { auth } from './services/firebase';
import { type Palette } from './theme';

export type TabParamList = {
  Home: undefined;
  // lineupCheck: open the lineup check sheet (any changing value)
  Fantasy: { lineupCheck?: number } | undefined;
  Trades: undefined;
  // ask: question to send to the AI once the league in leagueId is open
  ChatBot: { ask?: string; leagueId?: string; nonce?: number } | undefined;
  Madden: undefined; // tab currently disabled below
};

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * ============================
 * NAVIGATION TYPE DEFINITIONS
 * ============================
 */

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  PlayerDetails: {
    player: any;
    stats: any;
    week?: number;
    fantasyPoints: number;
  };
  DefenseRoster: {
    team: string;
    week: number;
  };
  ComparePlayer: {
    player?: any;
    allWeeksStats?: any;
  };
  // Players and teams you follow, organized by your team / free agents / other teams
  Following: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const APPEARANCE: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { mode: 'dark', label: 'Dark', icon: 'weather-night' },
  { mode: 'system', label: 'Match device', icon: 'theme-light-dark' },
];

/**
 * Top-right account menu: leagues, appearance, log out
 */
function AccountMenu() {
  const { colors, mode, setMode } = useTheme();
  const [visible, setVisible] = useState(false);
  const [showLeagues, setShowLeagues] = useState(false);
  const closeMenu = () => setVisible(false);

  return (
    <>
      <Menu
        visible={visible}
        onDismiss={closeMenu}
        anchor={
          <Pressable onPress={() => setVisible(true)} style={{ marginRight: 12 }} accessibilityLabel="Account menu">
            <Ionicons name="person-circle-outline" size={28} color={colors.text} />
          </Pressable>
        }
      >
        <Menu.Item
          leadingIcon="trophy-outline"
          onPress={() => {
            closeMenu();
            setShowLeagues(true);
          }}
          title="Leagues"
        />
        <Divider />
        <Text style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.8 }}>
          APPEARANCE
        </Text>
        {APPEARANCE.map(a => (
          <Menu.Item
            key={a.mode}
            leadingIcon={a.icon}
            trailingIcon={mode === a.mode ? 'check' : undefined}
            onPress={() => {
              setMode(a.mode);
              closeMenu();
            }}
            title={a.label}
          />
        ))}
        <Divider />
        <Menu.Item
          leadingIcon="map-marker-path"
          onPress={() => {
            closeMenu();
            openTutorial();
          }}
          title="App tour"
        />
        <Menu.Item leadingIcon="logout" onPress={() => signOut(auth)} title="Log Out" />
      </Menu>

      <LeaguesModal visible={showLeagues} onClose={() => setShowLeagues(false)} />
    </>
  );
}

/**
 * Bottom Tab Navigator
 */
function TabNavigator() {
  const { unreadBotMessages, isChatTyping, unreadTradeIdeas } = useFantasy();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <HelpAssistant />
            <NotificationBell />
            <AccountMenu />
          </View>
        ),
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
            Home: ['home', 'home-outline'],
            Fantasy: ['american-football', 'american-football-outline'],
            Trades: ['swap-horizontal', 'swap-horizontal-outline'],
            ChatBot: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'],
            Madden: ['game-controller', 'game-controller-outline'],
          };
          const iconName = (icons[route.name] ?? icons.Home)[focused ? 0 : 1];

          const showBadge =
            (route.name === 'ChatBot' && !focused && (isChatTyping || unreadBotMessages > 0)) ||
            (route.name === 'Trades' && !focused && unreadTradeIdeas > 0);
          const badgeCount = route.name === 'Trades' ? unreadTradeIdeas : unreadBotMessages;
          const badgeText =
            route.name === 'ChatBot' && isChatTyping ? '...' : badgeCount > 9 ? '9+' : String(badgeCount);

          return (
            <View style={styles.tabIconWrapper}>
              <Ionicons name={iconName} size={size} color={color} />
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeText}</Text>
                </View>
              ) : null}
            </View>
          );
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '600' },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: '800', color: colors.text },
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Fantasy" component={FantasyScreen} />
      <Tab.Screen name="Trades" component={TradeIdeasScreen} options={{ title: 'Trade Agent', tabBarLabel: 'Trades' }} />
      <Tab.Screen name="ChatBot" component={ChatBotScreen} options={{ title: 'AI Assistant', tabBarLabel: 'Assistant' }} />
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
  const { colors, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <FantasyProvider>
        <NotificationProvider>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: { fontWeight: '800', color: colors.text },
            headerTintColor: colors.primary,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="MainTabs" component={TabNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="PlayerDetails" component={PlayerDetailsScreen} options={{ title: "Player Details" }} />
          <Stack.Screen name="DefenseRoster" component={DefenseRosterScreen} options={{ title: "Defense Roster" }} />
          <Stack.Screen name="ComparePlayer" component={ComparePlayerScreen} options={{ title: "Compare Players" }} />
          <Stack.Screen name="Following" component={FollowingScreen} options={{ title: "Following" }} />
        </Stack.Navigator>
        <Tutorial />
        </NotificationProvider>
      </FantasyProvider>
    </NavigationContainer>
  );
}

/**
 * =====================
 * Styles
 * =====================
 */
const makeStyles = (c: Palette) => ({
  tabIconWrapper: { width: 26, height: 26, alignItems: 'center' as const, justifyContent: 'center' as const },
  badge: { position: 'absolute' as const, top: -6, right: -12, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: c.danger, alignItems: 'center' as const, justifyContent: 'center' as const },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' as const },
});
