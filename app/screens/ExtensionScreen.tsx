// app/screens/ExtensionScreen.tsx
// The FF Helper browser extension: what it does, download + install, connect it to your account
// with a one-time code, and the browsers you've linked.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { auth } from '../services/firebase';
import { createPairing, unlinkDevice, watchLinkedDevices, type LinkedDevice } from '../services/extensionLink';
import { formatCode, PAIRING_TTL_MS } from '../services/pairingCode';
import { newlyLinked, seenAgo } from '../services/extensionTrades';
import { radius, type Palette } from '../theme';

const ZIP_PATH = '/ffhelper-extension.zip';
const INSTALL_STEPS = [
  'Download the extension and unzip it.',
  'In Chrome, Edge or Brave, open chrome://extensions and turn on Developer mode (top right).',
  'Click Load unpacked and choose the unzipped folder.',
  'Click the FF Helper icon in your toolbar and enter the code below.',
];

// Pick a name to show in the extension. Never the email address.
const labelFor = (u: User) => (u.displayName?.trim() || 'your FF Helper account').slice(0, 60);

export default function ExtensionScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [devices, setDevices] = useState<LinkedDevice[] | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [justLinked, setJustLinked] = useState(false);
  // Browsers (id -> link time) when the current code was made, to notice the one that links.
  const devicesAtCode = useRef(new Map<string, number>());

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return;
    return watchLinkedDevices(user.uid, d => {
      setDevices(d);
      // A browser linked (or re-linked) while a code was showing.
      if (pairing && newlyLinked(devicesAtCode.current, d)) {
        setPairing(null);
        setJustLinked(true);
      }
    });
  }, [user?.uid, pairing?.code]);

  useEffect(() => {
    if (!pairing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pairing?.code]);

  const makeCode = async () => {
    if (!user) return;
    setCreating(true);
    setError('');
    setJustLinked(false);
    try {
      devicesAtCode.current = new Map((devices ?? []).map(d => [d.id, d.linkedAt]));
      setPairing(await createPairing(user.uid, labelFor(user)));
      setNow(Date.now());
    } catch (e: any) {
      setError("Couldn't make a code. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  const download = async () => {
    if (Platform.OS !== 'web') return;
    setDownloadError('');
    // Without a built zip the web server answers with the app page, so check first.
    const res = await fetch(ZIP_PATH, { method: 'HEAD' }).catch(() => null);
    if (!res?.ok || !String(res.headers.get('content-type') ?? '').includes('zip')) {
      setDownloadError("The extension download isn't available yet. Run npm run build:extension, then reload.");
      return;
    }
    Linking.openURL(ZIP_PATH).catch(() => undefined);
  };

  const left = pairing ? Math.max(0, pairing.expiresAt - now) : 0;
  const expired = !!pairing && left === 0;
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Your Sleeper trade offers, graded in FF Helper</Text>
      <Text style={styles.lede}>
        Sleeper doesn't share offers until they're accepted. This browser extension notices the offers Sleeper's website
        shows you and sends just the trade details here, so the Trades tab can grade them and suggest counters.
      </Text>

      <View style={styles.promise}>
        <View style={styles.promiseCol}>
          <Text style={styles.promiseHead}>What it reads</Text>
          <Text style={styles.promiseItem}>Trade offers on sleeper.com, while you have it open</Text>
          <Text style={styles.promiseItem}>Who's in each offer and its status</Text>
        </View>
        <View style={styles.promiseCol}>
          <Text style={styles.promiseHead}>What it never touches</Text>
          <Text style={styles.promiseItem}>Your Sleeper password or login</Text>
          <Text style={styles.promiseItem}>Any other website</Text>
          <Text style={styles.promiseItem}>Sending or accepting trades</Text>
        </View>
      </View>

      <Text style={styles.h2}>Install it</Text>
      {Platform.OS === 'web' ? (
        <Pressable style={styles.primaryBtn} onPress={download} accessibilityRole="button">
          <Ionicons name="download-outline" size={18} color={colors.onPrimary} />
          <Text style={styles.primaryText}>Download the extension</Text>
        </Pressable>
      ) : null}
      {Platform.OS === 'web' && !!downloadError && <Text style={styles.error}>{downloadError}</Text>}
      {Platform.OS !== 'web' && (
        <Text style={styles.note}>Browser extensions run on computers. Open FF Helper on your computer's browser to download it.</Text>
      )}
      <View style={styles.steps}>
        {INSTALL_STEPS.map((s, i) => (
          <View key={s} style={styles.step}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h2}>Connect it to your account</Text>
      {!user ? (
        <Text style={styles.note}>Sign in to connect the extension. Offers are saved to your account, so you need one.</Text>
      ) : justLinked ? (
        <View style={styles.linkedBanner}>
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          <Text style={styles.linkedText}>Linked. Open your league on sleeper.com and your pending offers will show in the Trades tab.</Text>
        </View>
      ) : pairing && !expired ? (
        <View style={styles.codeCard}>
          <Text style={styles.codeHint}>Enter this code in the extension</Text>
          <Text style={styles.code} selectable accessibilityLabel={`Code ${pairing.code.split('').join(' ')}`}>
            {formatCode(pairing.code)}
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${(left / PAIRING_TTL_MS) * 100}%` }]} />
          </View>
          <Text style={styles.codeHint}>Works once, for {mmss} more</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {expired && <Text style={styles.note}>That code expired. Make a new one.</Text>}
          <Pressable style={styles.primaryBtn} onPress={makeCode} disabled={creating} accessibilityRole="button">
            {creating ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons name="key-outline" size={18} color={colors.onPrimary} />}
            <Text style={styles.primaryText}>{expired ? 'Make a new code' : 'Get a connect code'}</Text>
          </Pressable>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      )}

      {!!user && (devices?.length ?? 0) > 0 && (
        <>
          <Text style={styles.h2}>Linked browsers</Text>
          <View style={styles.list}>
            {devices!.map(d => (
              <View key={d.id} style={styles.device}>
                <Ionicons name="desktop-outline" size={18} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{d.browser}</Text>
                  <Text style={styles.deviceMeta}>
                    {d.lastSyncAt ? `Last saw Sleeper ${seenAgo(d.lastSyncAt, Date.now())}` : 'Waiting for you to open sleeper.com'}
                  </Text>
                </View>
                <Pressable onPress={() => unlinkDevice(user.uid, d.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Unlink ${d.browser}`}>
                  <Text style={styles.unlink}>Unlink</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 40, width: '100%' as const, maxWidth: 640, alignSelf: 'center' as const, gap: 12 },
  h1: { fontSize: 26, lineHeight: 31, fontWeight: '800' as const, color: c.text, letterSpacing: -0.4 },
  lede: { fontSize: 15, lineHeight: 22, color: c.textMuted },
  h2: { fontSize: 18, fontWeight: '800' as const, color: c.text, marginTop: 14 },
  promise: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  promiseCol: { flexGrow: 1, flexBasis: 220, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: 12, gap: 4 },
  promiseHead: { fontSize: 13, fontWeight: '800' as const, color: c.text, marginBottom: 2 },
  promiseItem: { fontSize: 13, lineHeight: 19, color: c.textMuted },
  primaryBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, alignSelf: 'flex-start' as const, backgroundColor: c.primary, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11 },
  primaryText: { color: c.onPrimary, fontWeight: '800' as const, fontSize: 14 },
  note: { fontSize: 13, lineHeight: 19, color: c.textMuted },
  error: { fontSize: 13, color: c.danger },
  steps: { gap: 8 },
  step: { flexDirection: 'row' as const, gap: 10, alignItems: 'flex-start' as const },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.primarySoft, color: c.primary, fontWeight: '800' as const, fontSize: 12, textAlign: 'center' as const, lineHeight: 22 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21, color: c.text },
  // The one bold element: the code, set like a jersey number.
  codeCard: { alignItems: 'center' as const, gap: 10, paddingVertical: 22, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 2, borderColor: c.primary },
  code: { fontSize: 44, fontWeight: '900' as const, letterSpacing: 6, color: c.text, fontVariant: ['tabular-nums' as const] },
  codeHint: { fontSize: 13, color: c.textMuted },
  bar: { width: '70%' as const, height: 4, borderRadius: 2, backgroundColor: c.surfaceMuted, overflow: 'hidden' as const },
  barFill: { height: 4, backgroundColor: c.primary },
  linkedBanner: { flexDirection: 'row' as const, gap: 10, alignItems: 'center' as const, padding: 14, borderRadius: radius.md, backgroundColor: c.successSoft },
  linkedText: { flex: 1, fontSize: 14, lineHeight: 20, color: c.text, fontWeight: '600' as const },
  list: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  device: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: c.border },
  deviceName: { fontSize: 14, fontWeight: '700' as const, color: c.text },
  deviceMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  unlink: { fontSize: 13, fontWeight: '700' as const, color: c.danger },
});
