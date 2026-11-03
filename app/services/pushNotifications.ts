// app/services/pushNotifications.ts
// Shows notifications outside the app screen: Expo notifications on phones (including ones
// scheduled ahead of time, which fire even when the app is closed), and the browser's
// Notification API on the web (only while the app is open in a tab).

import { Platform } from 'react-native';

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied';

// Loaded only on phones; the web uses the browser API instead.
const Expo: any = Platform.OS !== 'web' ? require('expo-notifications') : null;
const BrowserNotification = (): any => (Platform.OS === 'web' ? (globalThis as any).Notification : undefined);

if (Expo) {
  Expo.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function getPushPermission(): Promise<PushPermission> {
  if (Expo) {
    const { status } = await Expo.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'default';
  }
  const api = BrowserNotification();
  return api ? (api.permission as PushPermission) : 'unsupported';
}

export async function requestPushPermission(): Promise<PushPermission> {
  if (Expo) {
    const { status } = await Expo.requestPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  }
  const api = BrowserNotification();
  if (!api) return 'unsupported';
  return api.permission === 'granted' ? 'granted' : ((await api.requestPermission()) as PushPermission);
}

/** Show a notification right away. */
export async function showNow(title: string, body: string, data: Record<string, unknown> = {}) {
  try {
    if (Expo) {
      await Expo.scheduleNotificationAsync({ content: { title, body, data }, trigger: null });
      return;
    }
    const api = BrowserNotification();
    if (api?.permission === 'granted') new api(title, { body, tag: String(data.id ?? title) });
  } catch {
    // some browsers only allow notifications from a service worker
  }
}

const webTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Show a notification at a set time. On phones it's handed to the OS, so it fires even if the
 * app is closed. On the web it only fires if the tab is still open.
 */
export async function scheduleAt(id: string, when: Date, title: string, body: string, data: Record<string, unknown> = {}) {
  const ms = when.getTime() - Date.now();
  if (ms <= 0) return;
  if (Expo) {
    await Expo.cancelScheduledNotificationAsync(id).catch(() => undefined);
    await Expo.scheduleNotificationAsync({
      identifier: id,
      content: { title, body, data: { ...data, id } },
      trigger: { type: Expo.SchedulableTriggerInputTypes?.DATE ?? 'date', date: when },
    });
    return;
  }
  if (ms > 24 * 3600 * 1000) return; // a browser tab won't stay open that long
  clearTimeout(webTimers.get(id));
  webTimers.set(id, setTimeout(() => showNow(title, body, { ...data, id }), ms));
}

/** Cancel scheduled notifications whose id starts with `prefix` and isn't in `keep`. */
export async function cancelScheduled(prefix: string, keep: string[] = []) {
  if (Expo) {
    const all: any[] = await Expo.getAllScheduledNotificationsAsync().catch(() => []);
    await Promise.all(
      all
        .filter(n => String(n.identifier).startsWith(prefix) && !keep.includes(n.identifier))
        .map(n => Expo.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined))
    );
    return;
  }
  for (const [id, t] of webTimers) {
    if (id.startsWith(prefix) && !keep.includes(id)) {
      clearTimeout(t);
      webTimers.delete(id);
    }
  }
}

/** Run `handler` with the notification's data when it's tapped (phones). */
export function onNotificationTap(handler: (data: Record<string, any>) => void): () => void {
  if (!Expo) return () => undefined;
  const sub = Expo.addNotificationResponseReceivedListener((r: any) => handler(r?.notification?.request?.content?.data ?? {}));
  return () => sub.remove();
}

