// app/types/user.ts

import { Timestamp } from "firebase/firestore";

export type FantasyTeamPlayer = {
  playerId: string;
  fullName: string;
  position: string;
  team: string;
  isStarter: boolean;
};

export type MyTeam = {
  leagueId: string;
  ownerId: string;
  rosterId: number;
  teamName: string;
  players: FantasyTeamPlayer[];
  starters: string[];
  starterSlotsByPosition?: Partial<Record<"QB" | "RB" | "WR" | "TE" | "K" | "DEF", number>>;
};

export type LeagueDoc = {
  leagueId: string;
  name: string;
  createdAt?: Timestamp | null;
};

export type UserProfile = {
  email?: string | null;
  displayName?: string | null;
  createdAt?: Timestamp | null;
  myTeam?: MyTeam | null;
};
