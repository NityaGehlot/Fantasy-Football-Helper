// AppNavigator.tsx
import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, NavigatorScreenParams, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Menu, Divider } from 'react-native-paper';
import { Pressable, View, Text, TextInput, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { signOut } from 'firebase/auth';

import HomeScreen from './screens/HomeScreen';
import FantasyScreen from './screens/FantasyScreen';
import ChatBotScreen from './screens/ChatBotScreen';
import PlayerDetailsScreen from "./screens/PlayerDetailsScreen";
import DefenseRosterScreen from "./screens/DefenseRosterScreen";
import ComparePlayerScreen from "./screens/ComparePlayerScreen";
import TradeIdeasScreen from "./screens/TradeIdeasScreen";

import { FantasyProvider, useFantasy } from './context/FantasyContext';
import { useTheme, useThemedStyles, type ThemeMode } from './context/ThemeContext';
import { auth } from './services/firebase';
import { radius, shadowFor, type Palette } from './theme';

export type TabParamList = {
  Home: undefined;
  Fantasy: undefined;
  Trades: undefined;
  ChatBot: undefined;
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
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const APPEARANCE: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { mode: 'dark', label: 'Dark', icon: 'weather-night' },
  { mode: 'system', label: 'Match device', icon: 'theme-light-dark' },
];

/**
 * Leagues popup: switch leagues, add one by ID, remove one.
 */
function LeaguesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { leagues, addLeague, deleteLeague, activeLeagueId, setActiveLeagueId } = useFantasy();
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAdd = async () => {
    const id = input.trim();
    if (!id) return setError('Paste your Sleeper league ID first.');
    if (!/^\d{6,}$/.test(id)) return setError('League IDs are long numbers, e.g. 1262118513326182400.');
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
              placeholder="Sleeper league ID"
              placeholderTextColor={colors.textSubtle}
              value={input}
              onChangeText={t => {
                setInput(t);
                setError('');
              }}
              onSubmitEditing={handleAdd}
              keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
              style={styles.input}
            />
            <Pressable style={[styles.addBtn, adding && { opacity: 0.7 }]} onPress={handleAdd} disabled={adding}>
              {adding ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.addBtnText}>Add</Text>}
            </Pressable>
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.hint}>
            Find it in the Sleeper app under League → Settings, or in the web address: sleeper.com/leagues/<Text style={{ fontWeight: '700' }}>ID</Text>
          </Text>
        </View>
      </View>
    </Modal>
  );
}

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
        headerRight: () => <AccountMenu />,
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
    <NavigationContainer theme={navTheme}>
      <FantasyProvider>
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
        </Stack.Navigator>
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
  hint: { color: c.textSubtle, fontSize: 12, marginTop: 8, lineHeight: 17 },
  tabIconWrapper: { width: 26, height: 26, alignItems: 'center' as const, justifyContent: 'center' as const },
  badge: { position: 'absolute' as const, top: -6, right: -12, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: c.danger, alignItems: 'center' as const, justifyContent: 'center' as const },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' as const },
});
