// app/services/onboarding.ts
// First-run tutorial state: shown once to new users (no leagues yet), and on demand from Help.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getUserProfile } from './userService';

const doneKey = (uid: string) => `ffh_onboarding_done_v1:${uid}`;
let visible = false;
const listeners = new Set<(v: boolean) => void>();
const emit = () => listeners.forEach(l => l(visible));

export function openTutorial() {
  visible = true;
  emit();
}

export async function finishTutorial(uid: string) {
  visible = false;
  emit();
  await AsyncStorage.setItem(doneKey(uid), '1').catch(() => undefined);
  if (uid && uid !== 'anon') await setDoc(doc(db, 'users', uid), { onboardingDone: true }, { merge: true }).catch(() => undefined);
}

/** Has this account finished the tutorial (on this device or any other)? */
export async function tutorialDone(uid: string): Promise<boolean> {
  if ((await AsyncStorage.getItem(doneKey(uid)).catch(() => null)) === '1') return true;
  const profile = uid && uid !== 'anon' ? await getUserProfile(uid).catch(() => null) : null;
  return profile?.onboardingDone === true;
}

/** New users: no leagues yet and never finished the tour. */
export const shouldAutoStart = (done: boolean, leaguesLoaded: boolean, leagueCount: number) => leaguesLoaded && !done && leagueCount === 0;

export function useTutorialVisible(): boolean {
  const [v, setV] = useState(visible);
  useEffect(() => {
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}
