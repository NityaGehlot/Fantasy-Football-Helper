// app/services/userService.ts

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { MyTeam, LeagueDoc, UserProfile } from "../types/user";

/**
 * Ensure a user document exists for the given uid. Safe to call repeatedly.
 */
export async function createUserIfNotExists(uid: string, email?: string | null) {
  if (!uid) throw new Error("uid is required");
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      email: email ?? null,
      createdAt: serverTimestamp(),
      myTeam: null,
    });
  } else if (email) {
    // keep email up-to-date
    await setDoc(userRef, { email }, { merge: true });
  }
}

/**
 * Set or clear the user's current team in their profile document.
 */
export async function setMyTeam(uid: string, team: MyTeam | null) {
  if (!uid) throw new Error("uid is required");
  await setDoc(doc(db, "users", uid), { myTeam: team }, { merge: true });
}

export async function getMyTeam(uid: string): Promise<MyTeam | null> {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as UserProfile;
  return data?.myTeam ?? null;
}

/**
 * Leagues are stored as subcollection `users/{uid}/leagues/{leagueId}`
 */
export async function addLeagueForUser(uid: string, leagueId: string, name: string) {
  if (!uid || !leagueId) throw new Error("uid and leagueId required");
  const leagueRef = doc(db, "users", uid, "leagues", leagueId);
  await setDoc(leagueRef, { leagueId, name, createdAt: serverTimestamp() });
}

export async function removeLeagueForUser(uid: string, leagueId: string) {
  if (!uid || !leagueId) return;
  await deleteDoc(doc(db, "users", uid, "leagues", leagueId));
}

export async function listUserLeagues(uid: string): Promise<LeagueDoc[]> {
  if (!uid) return [];
  const snap = await getDocs(collection(db, "users", uid, "leagues"));
  return snap.docs.map(d => d.data() as LeagueDoc);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}
