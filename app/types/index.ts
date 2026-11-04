// app/types/index.ts

export type User = {
  user_id: string;
  display_name: string;
  metadata: { team_name?: string };
};

export type Roster = {
  roster_id: number;
  owner_id: string;
  players: string[];
  starters: string[];
  matchup_id: number;
  // Players in IR slots
  reserve?: string[] | null;
  // Players on the taxi squad (dynasty leagues); they don't use a bench spot
  taxi?: string[] | null;
};

// Navigation types for your stack
export type RootStackParamList = {
  Home: undefined;
  Fantasy: undefined;
  ChatBot: undefined;
  Madden: undefined;

  TeamRoster: {
    roster: Roster;
    players: any;
    users: User[];
  };
};
