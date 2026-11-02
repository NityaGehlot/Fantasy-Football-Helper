// app/components/NotificationBell.tsx
// Bell in the top bar: unread count, and a list of notifications about your team.

import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useNotifications } from '../context/NotificationContext';
import { useFantasy } from '../context/FantasyContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { timeAgo } from '../services/leagueNews';
import type { AppNotification, NotificationKind } from '../services/notifications';
import { radius, shadowFor, type Palette } from '../theme';

const ICONS: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  lineup: 'warning',
  injury: 'medkit',
  ir: 'bandage',
  trade: 'swap-horizontal',
  result: 'trophy',
};

export default function NotificationBell() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const { activeLeagueId, setActiveLeagueId } = useFantasy();
  const {
    notifications,
    unreadCount,
    isRead,
    markAllRead,
    clearAll,
    browserEnabled,
    browserPermission,
    setBrowserEnabled,
  } = useNotifications();
  const [open, setOpen] = useState(false);

  const tone = (kind: NotificationKind) =>
    kind === 'injury' || kind === 'ir' ? colors.danger : kind === 'lineup' ? colors.warning : kind === 'result' ? colors.success : colors.primary;

  const close = () => {
    markAllRead();
    setOpen(false);
  };

  const openItem = (n: AppNotification) => {
    close();
    if (n.leagueId && n.leagueId !== activeLeagueId) setActiveLeagueId(n.leagueId);
    navigation.navigate('MainTabs', { screen: n.target });
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.bell} accessibilityLabel={`Notifications, ${unreadCount} unread`}>
        <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={24} color={colors.text} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation?.()}>
            <View style={styles.header}>
              <Text style={styles.title}>Notifications</Text>
              {notifications.length > 0 && (
                <Pressable onPress={clearAll} hitSlop={8}>
                  <Text style={styles.clear}>Clear all</Text>
                </Pressable>
              )}
              <Pressable onPress={close} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {Platform.OS === 'web' && browserPermission !== 'unsupported' && (
              <View style={styles.browserRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.browserTitle}>Browser notifications</Text>
                  <Text style={styles.browserSub}>
                    {browserPermission === 'denied'
                      ? 'Blocked in your browser settings. Allow notifications for this site to turn them on.'
                      : 'Pop up alerts while the app is open in another tab.'}
                  </Text>
                </View>
                <Switch
                  value={browserEnabled}
                  disabled={browserPermission === 'denied'}
                  onValueChange={v => setBrowserEnabled(v)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
            )}

            <ScrollView style={{ maxHeight: 420 }}>
              {notifications.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="notifications-off-outline" size={26} color={colors.textSubtle} />
                  <Text style={styles.emptyText}>
                    You're all caught up. We'll let you know about lineup problems, injuries during games, IR moves, new
                    trade ideas and final scores for your team.
                  </Text>
                </View>
              ) : (
                notifications.map(n => (
                  <Pressable key={n.id} style={[styles.item, !isRead(n.id) && styles.itemUnread]} onPress={() => openItem(n)}>
                    <View style={[styles.icon, { backgroundColor: `${tone(n.kind)}22` }]}>
                      <Ionicons name={ICONS[n.kind]} size={16} color={tone(n.kind)} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemTitle}>{n.title}</Text>
                      <Text style={styles.itemBody}>{n.body}</Text>
                      <Text style={styles.itemTime}>{timeAgo(n.createdAt)}</Text>
                    </View>
                    {!isRead(n.id) && <View style={styles.dot} />}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: Palette) => ({
  bell: { marginRight: 10, padding: 2 },
  badge: { position: 'absolute' as const, top: -3, right: -5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: c.danger, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' as const },
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 16 },
  sheet: { width: '100%' as const, maxWidth: 460, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, ...shadowFor(c) },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 10 },
  title: { flex: 1, fontSize: 20, fontWeight: '800' as const, color: c.text },
  clear: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  browserRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: c.surfaceMuted, marginBottom: 10 },
  browserTitle: { fontSize: 14, fontWeight: '700' as const, color: c.text },
  browserSub: { fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 16 },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center' as const, lineHeight: 19 },
  item: { flexDirection: 'row' as const, gap: 10, padding: 12, borderRadius: radius.md, marginBottom: 6, alignItems: 'flex-start' as const },
  itemUnread: { backgroundColor: c.primarySoft },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const },
  itemTitle: { fontSize: 14, fontWeight: '800' as const, color: c.text },
  itemBody: { fontSize: 13, color: c.text, marginTop: 2, lineHeight: 18 },
  itemTime: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 6 },
});
