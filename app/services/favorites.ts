// app/services/favorites.ts
// Players and teams you follow. Saved on this device right away and in your account, and
// shared by every screen through a tiny subscribe/notify store.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { auth } from './firebase';
import { getFavoritesForUser, setFavoritesForUser, type Favorites } from './userService';

const storageKey = (uid: string) => `ffh_favorites_v1:${uid}`;
const EMPTY: Favorites = { players: [], teams: [] };

let current: Favorites = EMPTY;
let loadedFor: string | null = null;
const listeners = new Set<(f: Favorites) => void>();

const emit = () => listeners.forEach(l => l(current));
const uidNow = () => auth.currentUser?.uid ?? 'anon';

async function load() {
  const uid = uidNow();
  if (loadedFor === uid) return;
  loadedFor = uid;
  try {
    const local = await AsyncStorage.getItem(storageKey(uid));
    if (local) {
      current = { ...EMPTY, ...JSON.parse(local) };
      emit();
    }
    const remote = await getFavoritesForUser(uid).catch(() => null);
    if (remote) {
      current = remote;
      AsyncStorage.setItem(storageKey(uid), JSON.stringify(current)).catch(() => undefined);
      emit();
    }
  } catch {
    // keep what we have
  }
}

function save(next: Favorites) {
  current = next;
  emit();
  const uid = uidNow();
  AsyncStorage.setItem(storageKey(uid), JSON.stringify(next)).catch(() => undefined);
  setFavoritesForUser(uid, next).catch(err => console.warn('Failed to save favorites:', err));
}

export function toggleFavoritePlayer(id: string) {
  const key = String(id);
  const players = current.players.includes(key) ? current.players.filter(p => p !== key) : [...current.players, key];
  save({ ...current, players });
}

export function toggleFavoriteTeam(team: string) {
  const key = String(team).toUpperCase();
  const teams = current.teams.includes(key) ? current.teams.filter(t => t !== key) : [...current.teams, key];
  save({ ...current, teams });
}

export function useFavorites(): Favorites {
  const [fav, setFav] = useState(current);
  useEffect(() => {
    listeners.add(setFav);
    load();
    return () => {
      listeners.delete(setFav);
    };
  }, []);
  return fav;
}

export { favoriteNews, favoriteReason } from './favoritesFilter';
