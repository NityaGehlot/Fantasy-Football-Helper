// app/components/NotificationBell.tsx
// Bell in the top bar: unread count, and the list of notifications for all your leagues.
// Each one is marked good news / heads up / update, shows when it happened, which league it's
// about, and has actions: open the right screen, or ask the AI what to do.

import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../context/NotificationContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { timeAgo } from '../services/leagueNews';
import { formatStamp, TONE_LABELS, type AppNotification, type NotificationKind, type NotificationTone } from '../services/notifications';
import { radius, shadowFor, type Palette } from '../theme';

const ICONS: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  lineup: 'warning',
  injury: 'medkit',
  ir: 'bandage',
  trade: 'swap-horizontal',
  result: 'trophy',
  big_play: 'flash',
  odds: 'trending-up',
  lineup_check: 'clipboard',
  drops: 'trending-down',
};

export default function NotificationBell() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { notifications, unreadCount, isRead, markAllRead, clearAll, pushEnabled, pushPermission, setPushEnabled, watched, openNotification } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);

  const toneColor = (tone: NotificationTone) => (tone === 'good' ? colors.success : tone === 'bad' ? colors.danger : colors.primary);

  const close = () => {
    markAllRead();
    setOpen(false);
  };

  const go = (n: AppNotification, askAI = false) => {
    close();
    openNotification(n, askAI);
  };

  // League filter chips appear once you have notifications from more than one league.
  const leaguesInList = [...new Map(notifications.filter(n => n.leagueName).map(n => [n.leagueId, n.leagueName!])).entries()];
  const shown = leagueFilter ? notifications.filter(n => n.leagueId === leagueFilter) : notifications;
  const pushLabel = Platform.OS === 'web' ? 'Browser notifications' : 'Phone notifications';

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

            {watched.length > 0 && (
              <Text style={styles.watching}>
                Watching {watched.map(w => w.leagueName).join(', ')}. Set your team in each league to get its alerts.
              </Text>
            )}

            {pushPermission !== 'unsupported' && (
              <View style={styles.pushRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pushTitle}>{pushLabel}</Text>
                  <Text style={styles.pushSub}>
                    {pushPermission === 'denied'
                      ? 'Blocked in your settings. Allow notifications for this app to turn them on.'
                      : Platform.OS === 'web'
                        ? 'Pop-up alerts while the app is open in a tab, plus a lineup check 90 minutes before kickoff.'
                        : 'Pop-up alerts, plus a lineup check 90 minutes before each kickoff (even when the app is closed).'}
                  </Text>
                </View>
                <Switch
                  value={pushEnabled}
                  disabled={pushPermission === 'denied'}
                  onValueChange={v => setPushEnabled(v)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
            )}

            {leaguesInList.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
                {[[null, 'All leagues'] as [string | null, string], ...leaguesInList].map(([id, name]) => (
                  <Pressable key={id ?? 'all'} style={[styles.filter, leagueFilter === id && styles.filterOn]} onPress={() => setLeagueFilter(id)}>
                    <Text style={[styles.filterText, leagueFilter === id && { color: colors.onPrimary }]} numberOfLines={1}>{name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <ScrollView style={{ maxHeight: 440 }}>
              {shown.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="notifications-off-outline" size={26} color={colors.textSubtle} />
                  <Text style={styles.emptyText}>
                    You're all caught up. You'll hear about lineup problems, injuries during games, touchdowns, win-odds swings,
                    IR moves, new trade ideas, final scores and a lineup check before kickoff.
                  </Text>
                </View>
              ) : (
                shown.map(n => {
                  const tone = toneColor(n.tone ?? 'info');
                  return (
                    <Pressable
                      key={n.id}
                      style={[styles.item, { borderLeftColor: tone }, !isRead(n.id) && styles.itemUnread]}
                      onPress={() => go(n)}
                    >
                      <View style={[styles.icon, { backgroundColor: `${tone}22` }]}>
                        <Ionicons name={ICONS[n.kind] ?? 'notifications'} size={16} color={tone} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.metaRow}>
                          <Text style={[styles.toneLabel, { color: tone }]}>{TONE_LABELS[n.tone ?? 'info'].toUpperCase()}</Text>
                          {!!n.leagueName && <Text style={styles.league} numberOfLines={1}>· {n.leagueName}</Text>}
                        </View>
                        <Text style={styles.itemTitle}>{n.title}</Text>
                        <Text style={styles.itemBody}>{n.body}</Text>
                        <View style={styles.footer}>
                          <Text style={styles.itemTime}>
                            {formatStamp(n.createdAt)} · {timeAgo(n.createdAt)}
                          </Text>
                          {!!n.aiQuestion && (
                            <Pressable style={styles.aiBtn} onPress={() => go(n, true)} accessibilityLabel="Ask the AI what to do">
                              <Ionicons name="sparkles" size={12} color={colors.primary} />
                              <Text style={styles.aiText}>Ask AI what to do</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                      {!isRead(n.id) && <View style={[styles.dot, { backgroundColor: tone }]} />}
                    </Pressable>
                  );
                })
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
  sheet: { width: '100%' as const, maxWidth: 480, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, ...shadowFor(c) },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 6 },
  title: { flex: 1, fontSize: 20, fontWeight: '800' as const, color: c.text },
  clear: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  watching: { fontSize: 12, color: c.textMuted, marginBottom: 8, lineHeight: 16 },
  pushRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: c.surfaceMuted, marginBottom: 10 },
  pushTitle: { fontSize: 14, fontWeight: '700' as const, color: c.text },
  pushSub: { fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 16 },
  filter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceMuted, maxWidth: 180 },
  filterOn: { backgroundColor: c.primary },
  filterText: { fontSize: 12, fontWeight: '700' as const, color: c.text },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center' as const, lineHeight: 19 },
  item: { flexDirection: 'row' as const, gap: 10, padding: 12, borderRadius: radius.md, marginBottom: 6, alignItems: 'flex-start' as const, borderLeftWidth: 4, backgroundColor: c.surface },
  itemUnread: { backgroundColor: c.surfaceMuted },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const },
  metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  toneLabel: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.6 },
  league: { fontSize: 11, color: c.textMuted, flexShrink: 1 },
  itemTitle: { fontSize: 14, fontWeight: '800' as const, color: c.text, marginTop: 1 },
  itemBody: { fontSize: 13, color: c.text, marginTop: 2, lineHeight: 18 },
  footer: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8, marginTop: 6, flexWrap: 'wrap' as const },
  itemTime: { fontSize: 11, color: c.textMuted },
  aiBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: c.primarySoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  aiText: { color: c.primary, fontWeight: '700' as const, fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
