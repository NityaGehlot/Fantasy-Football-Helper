import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Pressable,
} from 'react-native';
import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getPlayers,
  getMatchups,
  getLeagueHistory,
  getNFLState,
  refreshLeagueCache
} from '../services/sleeperAPI';

// >>> ADDED
import { getPlayerStatsByWeek, getNFLWeekStatus, getTeamsPlayingInWeek, type WeekStatus } from '../services/nflApi';
import { getLineupAlerts, type LineupAlert } from '../services/lineupAlerts';
import { fetchLiveScoreboard, livePlayerMap, LIVE_REFRESH_MS, type LiveScoreboard as LiveBoard } from '../services/liveMatchup';
import LiveScoreboard from '../components/LiveScoreboard';
import { getInjuryIndex } from '../services/injuryService';
import { currentInjury, indexInjuries } from '../services/injuryFormat';
import { Ionicons } from '@expo/vector-icons';
import { radius, shadowFor, type Palette } from '../theme';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useFantasy, type MyFantasyTeam } from "../context/FantasyContext";

import { Picker } from '@react-native-picker/picker';
import { User, Roster } from '../types';
import { useNavigation, useIsFocused, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../AppNavigator";
import PlayerCard from '../components/PlayerCard';
import LeaguesModal from '../components/LeaguesModal';
import LeagueIdHelp from '../components/LeagueIdHelp';
import LineupCheckSheet from '../components/LineupCheckSheet';
import { fetchLineupCheck, type LineupCheck } from '../services/lineupCheck';

const FLEX_NAMES: Record<string, string> = { SUPER_FLEX: 'SUPER FLEX', REC_FLEX: 'W/T FLEX', WRRB_FLEX: 'W/R FLEX' };
import { parseLeagueId } from '../services/leagueInput';
import { fetchIrAdvice, irStatusWord, type IrAdvice } from '../services/irAdvice';
import { Menu } from 'react-native-paper';

const MAX_FANTASY_WEEK_VISIBLE = 18;
const OFFSEASON_DEFAULT_WEEK = 17;

const clampWeek = (week: number) =>
  Math.max(1, Math.min(MAX_FANTASY_WEEK_VISIBLE, Number(week) || 1));

// Fallback when ESPN game states are unavailable: compare against Sleeper's NFL state.
// Sleeper's `week` rolls over early in the week, so ESPN is preferred for the current season.
const getWeekStatus = (
  season: number | undefined,
  week: number,
  nflState: { season?: string; week?: number; season_type?: string } | null
): WeekStatus => {
  const currentSeason = Number(nflState?.season);
  if (!season || !currentSeason) return 'completed';
  if (season < currentSeason) return 'completed';
  if (season > currentSeason) return 'upcoming';

  const seasonType = String(nflState?.season_type || '').toLowerCase();
  if (seasonType === 'pre') return 'upcoming';
  if (seasonType !== 'regular') return 'completed';

  const currentWeek = Number(nflState?.week) || 0;
  if (week < currentWeek) return 'completed';
  if (week === currentWeek) return 'in_progress';
  return 'upcoming';
};

const isFantasyOffseason = (seasonType?: string) => {
  const normalized = String(seasonType || '').toLowerCase();
  if (normalized) {
    return normalized !== 'regular';
  }

  const month = new Date().getMonth() + 1;
  return month >= 2 && month <= 8;
};

export default function FantasyScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [league, setLeague] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [players, setPlayers] = useState<any>({});
  const [matchups, setMatchups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewedTeamId, setViewedTeamId] = useState<string | null>(null);
  const [highlightStarters, setHighlightStarters] = useState(false);
  const [viewMode, setViewMode] = useState<'team' | 'both'>('team');
  const [weekMatchups, setWeekMatchups] = useState<any[]>([]);
  const [leagueInput, setLeagueInput] = useState("");
  const [addingLeague, setAddingLeague] = useState(false);
  const [newLeagueInput, setNewLeagueInput] = useState("");
  const [availableSeasons, setAvailableSeasons] = useState<Array<{ league_id: string; season: number; name: string }>>([]);
  const [selectedSeasonLeagueId, setSelectedSeasonLeagueId] = useState<string>("");
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [nflState, setNflState] = useState<{ season?: string; week?: number; season_type?: string } | null>(null);
  const [espnWeekStatus, setEspnWeekStatus] = useState<WeekStatus | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [teamsPlaying, setTeamsPlaying] = useState<Set<string> | null>(null);
  const [liveBoard, setLiveBoard] = useState<LiveBoard | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveNonce, setLiveNonce] = useState(0);
  const [leagueMenuOpen, setLeagueMenuOpen] = useState(false);
  const [showLeaguesModal, setShowLeaguesModal] = useState(false);
  const [addError, setAddError] = useState('');
  const [irAdvice, setIrAdvice] = useState<IrAdvice | null>(null);
  const [showLineupCheck, setShowLineupCheck] = useState(false);
  const [lineupCheck, setLineupCheck] = useState<LineupCheck | null>(null);
  const route = useRoute<any>();
  // Opened from a lineup-check notification
  useEffect(() => {
    if (route.params?.lineupCheck) setShowLineupCheck(true);
  }, [route.params?.lineupCheck]);
  const isFocused = useIsFocused();
  const [injuryIndex, setInjuryIndex] = useState(() => indexInjuries(null));

  // Current injury designations (daily file from nfl-data), so upcoming weeks show injuries too.
  useEffect(() => {
    getInjuryIndex().then(setInjuryIndex).catch(() => undefined);
  }, [refreshNonce]);
  type NavigationProp = NativeStackNavigationProp<
    RootStackParamList,
    "MainTabs"
  >;

  const navigation = useNavigation<NavigationProp>();

  

  // >>> ADDED
  const [playerStats2025, setPlayerStats2025] = useState<any[] | null>(null);

  // const LEAGUE_ID = '1262118513326182400';
  // const { activeLeagueId } = useFantasy();
  // const LEAGUE_ID = String(activeLeagueId);
  const {
    activeLeagueId,
    setActiveLeagueId,
    leagues,
    addLeague,
    selectedWeek,
    setSelectedWeek,
    myTeam,
    favoriteTeam,
    setMyTeam,
  } = useFantasy();


  // =====================
  // Load league history (seasons)
  // =====================
  useEffect(() => {
    if (!activeLeagueId) return;
    let cancelled = false;

    const loadSeasons = async () => {
      setLoadingSeasons(true);
      try {
        console.log('🔍 Loading league history for:', activeLeagueId);
        const [history, nflState] = await Promise.all([
          getLeagueHistory(activeLeagueId),
          getNFLState().catch(() => null),
        ]);

        const sortedHistory = [...history].sort(
          (a, b) => Number(b.season) - Number(a.season)
        );

        console.log('Found seasons:', history.map(h => h.season));
        if (cancelled) return;
        setAvailableSeasons(sortedHistory);
        setNflState(nflState);

        if (sortedHistory.length > 0) {
          const currentStateSeason = Number(nflState?.season) || new Date().getFullYear();
          const offseason = isFantasyOffseason(nflState?.season_type);

          const defaultSeason = offseason
            ? sortedHistory.find(h => Number(h.season) < currentStateSeason) ?? sortedHistory[0]
            : sortedHistory.find(h => Number(h.season) === currentStateSeason) ??
              sortedHistory.find(h => Number(h.season) < currentStateSeason) ??
              sortedHistory[0];

          const nextWeek = offseason
            ? OFFSEASON_DEFAULT_WEEK
            : clampWeek(Number(nflState?.week) || OFFSEASON_DEFAULT_WEEK);

          if (!cancelled) {
            setSelectedSeasonLeagueId(defaultSeason.league_id);
            setSelectedWeek(nextWeek);
          }
        }
      } catch (err) {
        console.error('Error loading league history:', err);
      } finally {
        if (!cancelled) {
          setLoadingSeasons(false);
        }
      }
    };

    loadSeasons();

    return () => {
      cancelled = true;
    };
  }, [activeLeagueId]);

  // Load Sleeper + NFL stats JSON together
useEffect(() => {
  if (!selectedSeasonLeagueId) return;
  let cancelled = false;
  const leagueId: string = selectedSeasonLeagueId;
  const statsSeason = Number(
    availableSeasons.find(s => s.league_id === leagueId)?.season
  ) || undefined;

  const load = async () => {
    setLoading(true);
    try {
      const [
        leagueData,
        usersData,
        rostersData,
        playersData,
        matchupsData,
        statsThisWeek
      ] = await Promise.all([
        getLeague(leagueId),
        getLeagueUsers(leagueId),
        getRosters(leagueId),
        getPlayers(),
        getMatchups(leagueId, selectedWeek),
        getPlayerStatsByWeek(selectedWeek, statsSeason)
      ]);

      if (cancelled) return;

      setLeague(leagueData);
      // If usersData is empty but rosters exist, build lightweight user placeholders
      if ((!usersData || usersData.length === 0) && Array.isArray(rostersData) && rostersData.length > 0) {
        const placeholderUsers = rostersData.map((r: any, idx: number) => ({
          user_id: String(r.owner_id || `owner_${idx}`),
          display_name: r.owner_id ? `Owner ${r.owner_id}` : `Owner ${idx + 1}`,
          metadata: { team_name: r?.settings?.team_name || '' },
        }));
        setUsers(placeholderUsers);
      } else {
        setUsers(usersData);
      }
      setRosters(rostersData);
      setPlayers(playersData);
      setMatchups(matchupsData);
      setWeekMatchups(matchupsData);

      setPlayerStats2025(
        statsThisWeek.map((p: any) => ({
          ...p,
          week: Number(p.week),
          season: Number(p.season) || 0,
          passing_yards: Number(p.passing_yards) || 0,
          passing_tds: Number(p.passing_tds) || 0,
          rushing_yards: Number(p.rushing_yards) || 0,
          rushing_tds: Number(p.rushing_tds) || 0,
          receiving_yards: Number(p.receiving_yards) || 0,
          receiving_tds: Number(p.receiving_tds) || 0,
          fantasy_points_ppr: Number(p.fantasy_points_ppr) || 0,
          injury_status: p.injury_status ?? "ACTIVE",
          practice_status: p.practice_status ?? "",
          primary_injury: p.primary_injury ?? "",
          secondary_injury: p.secondary_injury ?? "",
          practice_primary_injury: p.practice_primary_injury ?? "",
          practice_secondary_injury: p.practice_secondary_injury ?? "",
        }))
      );
    } catch (err) {
      console.error("Error loading league data:", err);
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  };

  load();
  return () => {
    cancelled = true;
  };
}, [selectedSeasonLeagueId, selectedWeek, refreshNonce]); // re-runs on season/week change or Refresh


  useEffect(() => {
    if (users.length === 0) {
      setViewedTeamId(null);
      return;
    }

    if (!viewedTeamId || !users.some(u => u.user_id === viewedTeamId)) {
      setViewedTeamId(users[0].user_id);
    }
  }, [users, viewedTeamId]);

  const getTeamName = (user: User) =>
    user.metadata.team_name || user.display_name;

  const viewedRoster = rosters.find((r) => r.owner_id === viewedTeamId);

  const buildMyTeam = (selectedOwnerId: string): MyFantasyTeam | null => {
    if (!selectedSeasonLeagueId) return null;

    const selectedUser = users.find(u => u.user_id === selectedOwnerId);
    const selectedRoster = rosters.find(r => r.owner_id === selectedOwnerId);
    if (!selectedUser || !selectedRoster) return null;

    const selectedTeam: MyFantasyTeam = {
      leagueId: selectedSeasonLeagueId,
      ownerId: selectedOwnerId,
      rosterId: selectedRoster.roster_id,
      teamName: getTeamName(selectedUser),
      starters: selectedRoster.starters || [],
      rosterPositions: (league?.roster_positions || []).map((s: string) => String(s).toUpperCase()),
      reserve: (selectedRoster.reserve || []).map(String),
      starterSlotsByPosition: (league?.roster_positions || []).reduce(
        (acc: Partial<Record<"QB" | "RB" | "WR" | "TE" | "K" | "DEF", number>>, slot: string) => {
          const normalized = String(slot).toUpperCase();
          if (normalized === "QB" || normalized === "RB" || normalized === "WR" || normalized === "TE" || normalized === "K" || normalized === "DEF") {
            acc[normalized] = (acc[normalized] || 0) + 1;
          }
          return acc;
        },
        {}
      ),
      players: (selectedRoster.players || []).map((playerId: string) => {
        const player = players[playerId] || {};
        return {
          playerId: String(playerId),
          fullName: String(player.full_name || "").trim(),
          position: String(player.position || "").toUpperCase(),
          team: String(player.team || "").toUpperCase(),
          isStarter: (selectedRoster.starters || []).includes(playerId),
        };
      }).filter((p: any) => Boolean(p.fullName)),
    };

    return selectedTeam;
  };

  // Restore the saved favorite team: select it and rebuild its roster for this season.
  // Match on Sleeper owner ID first (survives renames), then fall back to team name.
  useEffect(() => {
    if (!favoriteTeam || users.length === 0 || rosters.length === 0) return;
    const favoriteUser =
      users.find(u => favoriteTeam.ownerId && u.user_id === favoriteTeam.ownerId) ??
      users.find(u => favoriteTeam.teamName && getTeamName(u) === favoriteTeam.teamName);
    if (!favoriteUser) return;

    setViewedTeamId(favoriteUser.user_id);
    const team = buildMyTeam(favoriteUser.user_id);
    if (team) setMyTeam(team, { persist: false });
  }, [favoriteTeam, users, rosters]);

  // Check real game states for the selected week (current season only)
  useEffect(() => {
    setEspnWeekStatus(null);
    const season = Number(
      availableSeasons.find(s => s.league_id === selectedSeasonLeagueId)?.season
    );
    if (!season || season !== Number(nflState?.season)) return;

    let cancelled = false;
    getNFLWeekStatus(season, selectedWeek)
      .then(status => { if (!cancelled) setEspnWeekStatus(status); })
      .catch(err => console.warn('Failed to load week status from ESPN:', err));

    return () => {
      cancelled = true;
    };
  }, [selectedSeasonLeagueId, selectedWeek, availableSeasons, nflState]);

  // Teams with a game in the selected week (anyone else is on bye) for lineup alerts
  useEffect(() => {
    setTeamsPlaying(null);
    const season = Number(
      availableSeasons.find(s => s.league_id === selectedSeasonLeagueId)?.season
    );
    if (!season || season !== Number(nflState?.season) || selectedWeek > 18) return;

    let cancelled = false;
    getTeamsPlayingInWeek(season, selectedWeek)
      .then(teams => { if (!cancelled) setTeamsPlaying(teams); })
      .catch(err => console.warn('Failed to load bye weeks from ESPN:', err));

    return () => {
      cancelled = true;
    };
  }, [selectedSeasonLeagueId, selectedWeek, availableSeasons, nflState]);

  // Live scoreboard + win odds for the viewed team's matchup (current season, unfinished weeks).
  // Polls every minute while games are in progress and this screen is visible.
  const liveRosterId = rosters.find(r => r.owner_id === viewedTeamId)?.roster_id;
  const liveSeason = Number(availableSeasons.find(s => s.league_id === selectedSeasonLeagueId)?.season);
  const liveEligible =
    !!selectedSeasonLeagueId && liveRosterId !== undefined && !!liveSeason &&
    liveSeason === Number(nflState?.season) && espnWeekStatus !== 'completed' && selectedWeek <= 18;

  useEffect(() => {
    setLiveBoard(null);
    setLiveError(null);
  }, [selectedSeasonLeagueId, selectedWeek, liveRosterId]);

  useEffect(() => {
    if (!liveEligible || !isFocused) return;
    let cancelled = false;
    const load = async () => {
      setLiveLoading(true);
      try {
        const board = await fetchLiveScoreboard(selectedSeasonLeagueId, Number(liveRosterId), selectedWeek);
        if (!cancelled) { setLiveBoard(board); setLiveError(null); }
      } catch (err: any) {
        if (!cancelled) setLiveError(err?.message || 'Live scoreboard failed');
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    };
    load();
    const timer = espnWeekStatus === 'in_progress' ? setInterval(load, LIVE_REFRESH_MS) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [liveEligible, isFocused, selectedSeasonLeagueId, selectedWeek, liveRosterId, espnWeekStatus, liveNonce]);

  // IR advice for your own team in the current season: who to move to IR and who to add.
  const irRosterId = rosters.find(r => r.owner_id === myTeam?.ownerId)?.roster_id;
  const irEligible = !!selectedSeasonLeagueId && irRosterId !== undefined && !!liveSeason && liveSeason === Number(nflState?.season);
  useEffect(() => {
    setIrAdvice(null);
    if (!irEligible) return;
    let cancelled = false;
    fetchIrAdvice(selectedSeasonLeagueId, Number(irRosterId), myTeam?.ownerId)
      .then(a => { if (!cancelled) setIrAdvice(a); })
      .catch(err => console.warn('IR advice failed:', err));
    return () => {
      cancelled = true;
    };
  }, [irEligible, selectedSeasonLeagueId, irRosterId, refreshNonce]);

  // When your lineup has an empty starting spot, load the lineup check so the empty row can say
  // who to put there.
  const myStarters: string[] = (weekMatchups.find(m => m.roster_id === irRosterId)?.starters ?? []).map(String);
  const hasEmptyStarter = myStarters.some(id => !id || id === '0');
  useEffect(() => {
    setLineupCheck(null);
    if (!irEligible || !hasEmptyStarter || !activeLeagueId || !myTeam) return;
    let cancelled = false;
    fetchLineupCheck(activeLeagueId, Number(irRosterId), myTeam.ownerId)
      .then(c => { if (!cancelled) setLineupCheck(c); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [irEligible, hasEmptyStarter, activeLeagueId, irRosterId, refreshNonce]);

  const handleRefresh = async () => {
    if (!selectedSeasonLeagueId) return;
    await refreshLeagueCache(selectedSeasonLeagueId);
    setRefreshNonce(n => n + 1);
  };

  const getHeadshotUrl = (player: any) => {
    // 1. Try ESPN headshot using espn_id (best quality)
    if (player?.espn_id) {
      return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`;
    }

    // 2. Try Sleeper CDN using Sleeper player_id (covers most remaining players)
    if (player?.player_id) {
      return `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`;
    }

    // 3. Final fallback
    return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
  };

  const STARTER_ORDER: Record<string, number> = {
    QB: 1, RB: 2, WR: 3, TE: 4, FLEX: 5, K: 6, DEF: 7
  };

  const sortPlayers = (list: any[], starterIds: string[]) =>
    list.sort((a, b) => {
      const isAStarter = starterIds.includes(a.player_id);
      const isBStarter = starterIds.includes(b.player_id);

      // 1. Starters always show before bench players
      if (isAStarter && !isBStarter) return -1;
      if (!isAStarter && isBStarter) return 1;

      // 2. If BOTH are starters, sort by position order
      if (isAStarter && isBStarter) {
        return (STARTER_ORDER[a.position] || 99) - (STARTER_ORDER[b.position] || 99);
      }

      // 3. Safe fallback sort for bench players by name
      const nameA = a?.full_name || "";
      const nameB = b?.full_name || "";

      return nameA.localeCompare(nameB);
    });


  const getPositionColor = (pos: string) => {
    switch (pos) {
      case 'QB': return '#ff6b6b';
      case 'RB': return '#2ec4b6';
      case 'WR': return '#48b0f7';
      case 'TE': return '#ffbe0b';
      case 'K': return '#9d4edd';
      case 'DEF': return '#777';
      default: return '#aaa';
    }
  };

  const getOwnPercent = (playerId: string) =>
    Math.round((rosters.filter(r => r.players.includes(playerId)).length / rosters.length) * 100);

  const getStartPercent = (playerId: string) =>
    Math.round((rosters.filter(r => r.starters?.includes(playerId)).length / rosters.length) * 100);

  const getPointsThisWeek = (playerId: string): number => {
    if (!viewedRoster || !weekMatchups) return 0;
    const myMatchup = weekMatchups.find(m => m.roster_id === viewedRoster.roster_id);
    return myMatchup?.players_points?.[playerId] ?? 0;
  };

  const getTeamWeeklyResult = () => {
    if (!viewedRoster || !weekMatchups) return { points: 0, result: '-' };
    const myMatchup = weekMatchups.find(m => m.roster_id === viewedRoster.roster_id);
    if (!myMatchup) return { points: 0, result: '-' };
    const totalPoints = (myMatchup.starters_points || []).reduce((a: any, b: any) => a + b, 0);

    const opponent = weekMatchups.find(
      m => m.matchup_id === myMatchup.matchup_id && m.roster_id !== viewedRoster.roster_id
    );
    const opponentPoints = opponent?.starters_points?.reduce((a: any, b: any) => a + b, 0) ?? 0;
    const result = totalPoints > opponentPoints ? 'WIN' : totalPoints < opponentPoints ? 'LOSS' : 'TIE';

    return { points: totalPoints, result };
  };


  const EMPTY_STATS = {
  passing_yards: 0,
  passing_tds: 0,
  passing_interceptions: 0,
  completions: 0,
  attempts: 0,
  carries: 0,
  rushing_yards: 0,
  rushing_tds: 0,
  receiving_yards: 0,
  receiving_tds: 0,
  targets: 0,
  receptions: 0,
  fumbles: 0,
  // ✅ Add these so injury checks don't get undefined
  injury_status: "ACTIVE",
  practice_status: "",
  primary_injury: "",
  secondary_injury: "",
  practice_primary_injury: "",
  practice_secondary_injury: "",
};

  // =====================
// Get Player/DEF Stats
// =====================
// Team shown on a player card. A completed week uses the team from that week's stats
// (accurate even after trades). Weeks that haven't finished have no stats file yet,
// so fall back to the player's current team from Sleeper's live players data.
const getDisplayTeam = (player: any, stats: any): string => {
  const statsTeam = String(stats?.team || '').trim();
  if (statsTeam) return statsTeam;
  if (weekStatus !== 'completed') return String(player?.team || '').trim();
  return '';
};

const getPlayerNFLStats = (playerId: string | number, week: number) => {
  if (!playerStats2025) return EMPTY_STATS;

  const sleeperPlayer = players[playerId];
  if (!sleeperPlayer) return EMPTY_STATS;

  const weekMatches = playerStats2025.filter(
    p => Number(String(p.week).trim()) === Number(week)
  );

  // ======================
  // DEFENSE MATCH
  // ======================
  const sleeperPosition = String(sleeperPlayer.position_for_FFHelper || sleeperPlayer.position || sleeperPlayer.position_listed_on_sleeper || '').toUpperCase().trim();
  if (sleeperPosition === "DEF") {
    const defId = `DEF_${sleeperPlayer.team}`;
    return weekMatches.find(p => String(p.player_id) === defId) ?? EMPTY_STATS;
  }

  // ======================
  // PLAYER ID MATCH FIRST (most reliable)
  // ======================
  const idMatch = weekMatches.find(
    p => String(p.player_id) === String(playerId)
  );
  if (idMatch) return idMatch;

  // ======================
  // FALLBACK: NAME MATCH
  // ======================
  const fullName = sleeperPlayer.full_name?.toLowerCase();
  if (!fullName) return EMPTY_STATS;

  const nameMatch = weekMatches.find(p => {
    const jsonName = p.player_name?.toLowerCase();
    if (!jsonName) return false;
    return (
      (jsonName.includes(fullName) || fullName.includes(jsonName)) &&
      p.position === sleeperPosition
    );
  });

  if (nameMatch) return nameMatch;

  // ======================
  // FALLBACK: INJURY-ONLY ROW (player exists but has no stats this week)
  // ======================
  // Search ALL weeks for this player to find their injury data for this week
  const injuryRow = playerStats2025.find(
    p =>
      Number(String(p.week).trim()) === Number(week) &&
      String(p.player_id) === String(playerId)
  );

  return injuryRow ?? EMPTY_STATS;
};





// =====================
// Format Stats for Display
// =====================
const formatPlayerStats = (position: string, stats: any) => {
  if (!stats) return [];

  const lines: string[] = [];

  const pos = String(position).trim().toUpperCase();

  // -------- QB --------
  if (pos === "QB") {
    const passing: string[] = [];
    if (stats.completions > 0 || stats.attempts > 0) passing.push(`${stats.completions}/${stats.attempts} CMP`);
    if (stats.passing_yards > 0) passing.push(`${stats.passing_yards} YD`);
    if (stats.passing_tds > 0) passing.push(`${stats.passing_tds} TD`);
    if (stats.passing_interceptions > 0) passing.push(`${stats.passing_interceptions} INT`);
    if (passing.length) lines.push(passing.join(", "));

    const rushing: string[] = [];
    if (stats.carries > 0) rushing.push(`${stats.carries} CAR`);
    if (stats.rushing_yards > 0) rushing.push(`${stats.rushing_yards} YD`);
    if (stats.rushing_tds > 0) rushing.push(`${stats.rushing_tds} TD`);
    if (rushing.length) lines.push(rushing.join(", "));
  }

  // -------- RB --------
  if (pos === "RB") {
    const rushing: string[] = [];
    if (stats.carries > 0) rushing.push(`${stats.carries} CAR`);
    if (stats.rushing_yards > 0) rushing.push(`${stats.rushing_yards} YD`);
    if (stats.rushing_tds > 0) rushing.push(`${stats.rushing_tds} TD`);
    if (rushing.length) lines.push(rushing.join(", "));

    const receiving: string[] = [];
    if (stats.receptions > 0 || stats.targets > 0) receiving.push(`${stats.receptions}/${stats.targets} REC`);
    if (stats.receiving_yards > 0) receiving.push(`${stats.receiving_yards} YD`);
    if (stats.receiving_tds > 0) receiving.push(`${stats.receiving_tds} TD`);
    if (receiving.length) lines.push(receiving.join(", "));
  }

  // -------- WR / TE --------
  if (pos === "WR" || pos === "TE") {
    const rushing: string[] = [];
    if (stats.carries > 0) rushing.push(`${stats.carries} CAR`);
    if (stats.rushing_yards > 0) rushing.push(`${stats.rushing_yards} YD`);
    if (stats.rushing_tds > 0) rushing.push(`${stats.rushing_tds} TD`);
    if (rushing.length) lines.push(rushing.join(", "));

    const receiving: string[] = [];
    if (stats.receptions > 0 || stats.targets > 0) receiving.push(`${stats.receptions}/${stats.targets} REC`);
    if (stats.receiving_yards > 0) receiving.push(`${stats.receiving_yards} YD`);
    if (stats.receiving_tds > 0) receiving.push(`${stats.receiving_tds} TD`);
    if (receiving.length) lines.push(receiving.join(", "));
  }

  // -------- Kicker --------
  if (pos === "K") {
    const fgLine: string[] = [];

    const fgMade =
      Number(stats.fg_made_0_19 || 0) +
      Number(stats.fg_made_20_29 || 0) +
      Number(stats.fg_made_30_39 || 0) +
      Number(stats.fg_made_40_49 || 0) +
      Number(stats.fg_made_50_59 || 0) +
      Number(stats.fg_made_60_ || 0);

    if (stats.fg_att > 0) fgLine.push(`${fgMade}/${stats.fg_att} FG`);

    const fgBuckets: string[] = [];
    if (Number(stats.fg_made_0_19) > 0) fgBuckets.push(`${stats.fg_made_0_19} FG (0-19)`);
    if (Number(stats.fg_made_20_29) > 0) fgBuckets.push(`${stats.fg_made_20_29} FG (20-29)`);
    if (Number(stats.fg_made_30_39) > 0) fgBuckets.push(`${stats.fg_made_30_39} FG (30-39)`);
    if (Number(stats.fg_made_40_49) > 0) fgBuckets.push(`${stats.fg_made_40_49} FG (40-49)`);
    if (Number(stats.fg_made_50_59) > 0) fgBuckets.push(`${stats.fg_made_50_59} FG (50-59)`);
    if (Number(stats.fg_made_60_) > 0) fgBuckets.push(`${stats.fg_made_60_} FG (60+)`);

    if (fgBuckets.length) fgLine.push(fgBuckets.join(", "));
    if (fgLine.length) lines.push(fgLine.join(", "));

    if (stats.pat_att > 0) lines.push(`${stats.pat_made}/${stats.pat_att} XP`);
  }

  // -------- Defense --------
  if (pos === "DEF") {
    const sacks             = Number(stats.def_sacks ?? 0);
    const interceptions     = Number(stats.def_interceptions ?? 0);
    const fumblesForced     = Number(stats.def_fumbles_forced ?? 0);
    const fumblesRecovered  = Number(stats.fumbles_recovered ?? 0);
    const defTDs            = Number(stats.def_tds ?? 0);
    const stTDs             = Number(stats.special_teams_tds ?? 0);
    const safeties          = Number(stats.def_safeties ?? 0);
    const pointsAllowed     = Number(stats.points_allowed ?? 0);

    const defense: string[] = [];
    if (sacks > 0)            defense.push(`${sacks} SACK`);
    if (interceptions > 0)    defense.push(`${interceptions} INT`);
    if (fumblesForced > 0)    defense.push(`${fumblesForced} FF`);
    if (fumblesRecovered > 0) defense.push(`${fumblesRecovered} FR`);
    if (defTDs + stTDs > 0)   defense.push(`${defTDs + stTDs} TD`);
    if (safeties > 0)         defense.push(`${safeties} SFTY`);
    if (defense.length)       lines.push(defense.join(", "));

    lines.push(`${pointsAllowed} PTS ALLOWED`);
    return lines;
  }


  // Trim extra spaces around '/'
  return lines.map(line => line.replace(/\/\s+/g, '/').trim());
};

  // =====================
// TEMP: No league added yet
// =====================
// Must stay below every hook: returning before them breaks React's hook order
// when the first league is added.
if (!activeLeagueId) {
  return (
    <View style={[styles.center, { padding: 24 }]}>
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Ionicons name="trophy-outline" size={26} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>Add your Sleeper league</Text>
        <Text style={styles.emptyText}>
          Paste your league ID (or the league's sleeper.com link) to see rosters, live scores, win odds and lineup alerts.
        </Text>
        <TextInput
          placeholder="League ID or sleeper.com link"
          placeholderTextColor={colors.textSubtle}
          value={newLeagueInput}
          onChangeText={t => {
            setNewLeagueInput(t);
            setAddError('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.emptyInput}
        />
        <Pressable
          style={[styles.primaryBtn, addingLeague && { opacity: 0.7 }]}
          disabled={addingLeague}
          onPress={async () => {
            if (!newLeagueInput.trim()) return setAddError('Paste your league ID or link first.');
            const id = parseLeagueId(newLeagueInput);
            if (!id) return setAddError("That doesn't look like a league ID. It's the long number after /leagues/ in the sleeper.com address.");
            setAddingLeague(true);
            try {
              await addLeague(id);
              setNewLeagueInput("");
            } catch (err) {
              console.error("Error adding league:", err);
              setAddError("Couldn't find that league on Sleeper. Double-check the number.");
            } finally {
              setAddingLeague(false);
            }
          }}
        >
          <Text style={styles.primaryBtnText}>{addingLeague ? "Adding..." : "Add league"}</Text>
        </Pressable>
        {!!addError && <Text style={styles.addError}>{addError}</Text>}
        <LeagueIdHelp />
      </View>
    </View>
  );
}


  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your league…</Text>
      </View>
    );
  }

  /** Use actual players from the selected week's matchup */
  const myWeekMatchup = weekMatchups.find(m => m.roster_id === viewedRoster?.roster_id);
  const starterIds = myWeekMatchup?.starters || [];
  const allIds = myWeekMatchup?.players || [];
  const enrichedPlayers = allIds.map((id: string | number) => ({ ...players[id], player_id: id }));
  const sortedList = sortPlayers(enrichedPlayers, starterIds);
  const benchList = sortedList.filter(p => !starterIds.includes(p.player_id));

  // Build starters with assigned slots (use league.roster_positions when available)
  const startersWithSlot = sortedList
    .filter(p => starterIds.includes(p.player_id))
    .map(p => {
      const starterIndex = starterIds.indexOf(p.player_id);
      const assignedSlot = (league?.roster_positions && starterIndex >= 0)
        ? String(league.roster_positions[starterIndex]).toUpperCase()
        : (p.position || '').toUpperCase();
      return { ...p, assignedSlot };
    });

  // Sort starters so FLEX appears between TE and K
  const SLOT_ORDER: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 4, FLEX: 5, K: 6, DEF: 7 };
  const startersList = startersWithSlot.sort((a, b) => {
    const oa = SLOT_ORDER[a.assignedSlot] ?? 99;
    const ob = SLOT_ORDER[b.assignedSlot] ?? 99;
    if (oa !== ob) return oa - ob;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });
  const buildSide = (matchup: any) => {
    const sIds: string[] = matchup?.starters || [];
    const sideRoster = rosters.find(r => r.roster_id === matchup?.roster_id);
    // Players in IR slots get their own section instead of showing on the bench.
    const reserveIds: string[] = (sideRoster?.reserve ?? []).map(String);
    const sorted = sortPlayers(
      (matchup?.players || []).map((id: string | number) => ({ ...players[id], player_id: id })),
      sIds
    );
    const bench = sorted.filter(p => !sIds.includes(p.player_id) && !reserveIds.includes(String(p.player_id)));
    const ir = reserveIds.map(id => ({ ...players[id], player_id: id }));
    const starters = sorted
      .filter(p => sIds.includes(p.player_id))
      .map(p => {
        const idx = sIds.indexOf(p.player_id);
        const assignedSlot = (league?.roster_positions && idx >= 0)
          ? String(league.roster_positions[idx]).toUpperCase()
          : (p.position || '').toUpperCase();
        return { ...p, assignedSlot };
      })
      // Empty starting spots in Sleeper ("0") are shown too, so you can see what to fill.
      .concat(
        sIds.flatMap((id, idx) =>
          !id || String(id) === '0'
            ? [{ player_id: `empty-${idx}`, empty: true, assignedSlot: String(league?.roster_positions?.[idx] ?? '').toUpperCase() }]
            : []
        )
      )
      .sort((a: any, b: any) => {
        const oa = SLOT_ORDER[a.assignedSlot] ?? 99;
        const ob = SLOT_ORDER[b.assignedSlot] ?? 99;
        if (oa !== ob) return oa - ob;
        return (a.full_name || '').localeCompare(b.full_name || '');
      });
    const roster = rosters.find(r => r.roster_id === matchup?.roster_id);
    const owner = users.find(u => u.user_id === roster?.owner_id);
    const liveSide = [liveBoard?.me, liveBoard?.opponent].find(s => s && s.rosterId === matchup?.roster_id);
    const total = liveSide?.points ?? (matchup?.starters_points || []).reduce((a: number, b: number) => a + b, 0);
    return { matchup, starterIds: sIds, starters, bench, ir, name: owner ? getTeamName(owner) : 'Unknown', total };
  };

  const opponentMatchup = myWeekMatchup
    ? weekMatchups.find(m => m.matchup_id === myWeekMatchup.matchup_id && m.roster_id !== myWeekMatchup.roster_id)
    : undefined;
  const mySide = buildSide(myWeekMatchup);
  const oppSide = opponentMatchup ? buildSide(opponentMatchup) : null;

  const liveById = livePlayerMap(liveBoard);
  // Bye for the week being viewed (completed weeks use the stats file's own bye flag).
  const byeForSelectedWeek = (player: any): boolean | undefined => {
    if (weekStatus === 'completed' || !teamsPlaying || teamsPlaying.size === 0) return undefined;
    const team = String(player?.team ?? '').toUpperCase();
    const aliases: Record<string, string> = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
    return !!team && !teamsPlaying.has(aliases[team] ?? team);
  };
  const renderPlayer = (side: ReturnType<typeof buildSide>, player: any, isStarter: boolean, dense = false) => {
    if (player.empty) return renderEmptySlot(side, player.assignedSlot, player.player_id, dense);
    let stats = getPlayerNFLStats(player.player_id, selectedWeek);
    const live = weekStatus !== 'completed' ? liveById[String(player.player_id)] : undefined;
    // Weeks that aren't over have no stats file yet: show today's injury designation instead.
    if (weekStatus !== 'completed') {
      const inj = currentInjury(injuryIndex, player);
      if (inj.status) stats = { ...stats, injury_status: inj.status, primary_injury: inj.injury || stats?.primary_injury };
    }
    // During an unfinished week, show the live stat line and game clock instead of last week's file.
    const statLine = live
      ? [live.statLine, live.game.detail].filter(Boolean)
      : formatPlayerStats(player.position, stats);
    const imageUri = player.position === 'DEF' ? getTeamLogo(stats?.team || player.team) : getHeadshotUrl(player);
    const pts = live?.points ?? side.matchup?.players_points?.[player.player_id] ?? 0;
    const positionToShow = isStarter ? (player.assignedSlot || player.position) : player.position;
    return (
      <TouchableOpacity
        key={player.player_id}
        style={[styles.playerRow, { flex: 1 }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PlayerDetails', { player, stats, week: selectedWeek, fantasyPoints: pts })}
      >
        <PlayerCard
          player={player}
          stats={stats}
          statLine={statLine}
          points={pts}
          imageUri={imageUri}
          position={positionToShow}
          positionColor={getPositionColor(positionToShow || player.position)}
          team={getDisplayTeam(player, stats)}
          dense={dense}
          showCurrentStatus={weekStatus !== 'completed'}
          onBye={byeForSelectedWeek(player)}
          projected={live && live.game.state !== 'post' && live.game.state !== 'bye' && live.id !== '0' ? live.projectedFinal : undefined}
        />
      </TouchableOpacity>
    );
  };

  // An empty starting spot, with who to put there (from the lineup check) for your own team.
  const renderEmptySlot = (side: ReturnType<typeof buildSide>, slot: string, key: string, dense: boolean) => {
    const mine = isViewingMyTeam && side === mySide;
    const fill = mine ? lineupCheck?.swaps.find(sw => sw.slot === slot && !sw.bench) : undefined;
    const label = FLEX_NAMES[slot] ?? slot;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.playerRow, styles.emptyRow, dense && { paddingHorizontal: 8 }]}
        activeOpacity={0.7}
        disabled={!mine}
        onPress={() => setShowLineupCheck(true)}
      >
        <View style={[styles.emptyBadge, { borderColor: colors.danger }]}>
          <Text style={[styles.emptyBadgeText, { color: colors.danger }]}>{label}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.emptySlotTitle} numberOfLines={1}>Empty {label} spot</Text>
          <Text style={styles.emptySlotSub} numberOfLines={dense ? 3 : 2}>
            {!mine
              ? 'No one is starting here.'
              : fill
                ? `Start ${fill.start.name} here (+${fill.start.value.toFixed(2)} pts). Tap for the full lineup check.`
                : lineupCheck
                  ? `Nobody on your roster can play ${label}. Pick one up from waivers.`
                  : 'This spot scores 0. Tap to see who to put here.'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderBanner = (side: ReturnType<typeof buildSide>, other?: ReturnType<typeof buildSide>) => {
    const outcome = other && weekStatus === 'completed'
      ? (side.total > other.total ? 'WIN' : side.total < other.total ? 'LOSS' : 'TIE')
      : null;
    const outcomeColor = outcome === 'WIN' ? colors.success : outcome === 'LOSS' ? colors.danger : colors.warning;
    return (
      <View style={[styles.banner, outcome && { backgroundColor: outcomeColor, borderColor: outcomeColor }]}>
        <Text style={[styles.bannerName, outcome && { color: '#fff' }]} numberOfLines={1}>{side.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          <Text style={[styles.bannerPoints, outcome && { color: '#fff' }]}>{side.total.toFixed(2)}</Text>
          {outcome && <Text style={styles.bannerOutcome}>{outcome}</Text>}
        </View>
      </View>
    );
  };

  const renderRoster = (side: ReturnType<typeof buildSide>) => (
    <View>
      {renderBanner(side)}
      <Text style={styles.sectionLabel}>STARTERS</Text>
      <View style={styles.listCard}>{side.starters.map(p => renderPlayer(side, p, true))}</View>
      <Text style={styles.sectionLabel}>BENCH</Text>
      <View style={styles.listCard}>{side.bench.map(p => renderPlayer(side, p, false))}</View>
      {side.ir.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>INJURED RESERVE</Text>
          <View style={styles.listCard}>{side.ir.map(p => renderPlayer(side, p, false))}</View>
        </>
      )}
    </View>
  );

  // Rows are paired by index so each player lines up with their counterpart.
  const renderSideBySide = (left: ReturnType<typeof buildSide>, right: ReturnType<typeof buildSide>) => {
    const rowColor = (lp: any, rp: any, isStarter: boolean, forLeft: boolean) => {
      if (!highlightStarters || !isStarter || !lp || !rp) return undefined;
      const a = liveById[String(lp.player_id)]?.points ?? left.matchup?.players_points?.[lp.player_id] ?? 0;
      const b = liveById[String(rp.player_id)]?.points ?? right.matchup?.players_points?.[rp.player_id] ?? 0;
      if (a === b) return colors.surfaceMuted;
      return (a > b) === forLeft ? colors.successSoft : colors.dangerSoft;
    };
    const pairRows = (l: any[], r: any[], isStarter: boolean) =>
      Array.from({ length: Math.max(l.length, r.length) }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, marginRight: 4, borderRadius: 8, backgroundColor: rowColor(l[i], r[i], isStarter, true) }}>{l[i] ? renderPlayer(left, l[i], isStarter, true) : null}</View>
          <View style={{ flex: 1, marginLeft: 4, borderRadius: 8, backgroundColor: rowColor(l[i], r[i], isStarter, false) }}>{r[i] ? renderPlayer(right, r[i], isStarter, true) : null}</View>
        </View>
      ));
    return (
      <View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>{renderBanner(left, right)}</View>
          <View style={{ flex: 1 }}>{renderBanner(right, left)}</View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.sectionLabel, { flex: 1 }]}>STARTERS</Text>
          <TouchableOpacity
            style={[styles.chip, highlightStarters && styles.chipOn, { marginTop: 10 }]}
            onPress={() => setHighlightStarters(v => !v)}
          >
            <Ionicons name="color-filter-outline" size={13} color={highlightStarters ? colors.onPrimary : colors.textMuted} />
            <Text style={[styles.chipText, highlightStarters && styles.chipTextOn]}>
              {highlightStarters ? 'Hide colors' : 'Head-to-head colors'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.listCard}>{pairRows(left.starters, right.starters, true)}</View>
        <Text style={styles.sectionLabel}>BENCH</Text>
        <View style={styles.listCard}>{pairRows(left.bench, right.bench, false)}</View>
        {(left.ir.length > 0 || right.ir.length > 0) && (
          <>
            <Text style={styles.sectionLabel}>INJURED RESERVE</Text>
            <View style={styles.listCard}>{pairRows(left.ir, right.ir, false)}</View>
          </>
        )}
      </View>
    );
  };

  const getTeamLogo = (teamAbbrev: string) => {
    if (!teamAbbrev) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
    return `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${teamAbbrev.trim()}`;
  };

// Replaced inline player row with `PlayerCard` component below


  const { points, result: finalResult } = getTeamWeeklyResult();
  const selectedSeason = Number(
    availableSeasons.find(s => s.league_id === selectedSeasonLeagueId)?.season
  ) || undefined;
  const isCurrentSeason = !!selectedSeason && selectedSeason === Number(nflState?.season);
  const weekStatus: WeekStatus =
    (isCurrentSeason && espnWeekStatus) || getWeekStatus(selectedSeason, selectedWeek, nflState);
  const result =
    weekStatus === 'upcoming' ? "Week hasn't started" :
    weekStatus === 'in_progress' ? 'Week is in progress' :
    finalResult;
  const resultColor =
    result === 'WIN' ? colors.success :
    result === 'LOSS' ? colors.danger :
    weekStatus === 'completed' ? colors.warning : colors.textMuted;

  // Only warn about your own lineup, and only for weeks that aren't over.
  const isViewingMyTeam = !!myTeam && myTeam.ownerId === viewedTeamId;
  const lineupAlerts: LineupAlert[] =
    isViewingMyTeam && weekStatus !== 'completed'
      ? getLineupAlerts({
          starterIds: myWeekMatchup?.starters ?? viewedRoster?.starters ?? [],
          rosterPositions: league?.roster_positions ?? [],
          // Prefer the daily injury file over Sleeper's cached copy of the player database.
          playersById: Object.fromEntries(
            (myWeekMatchup?.starters ?? viewedRoster?.starters ?? []).map((id: string) => {
              const p = { ...(players[id] ?? {}), player_id: id };
              const inj = currentInjury(injuryIndex, p);
              return [id, inj.status ? { ...p, injury_status: inj.status, injury_body_part: inj.injury || p.injury_body_part } : p];
            })
          ),
          teamsPlaying,
          week: selectedWeek,
          // Once a game kicks off, injury alerts describe what happened instead of "check before kickoff".
          gameStates: Object.fromEntries(Object.values(liveById).map(p => [p.id, p.game.state])),
          pointsById: Object.fromEntries(Object.values(liveById).map(p => [p.id, p.points])),
        })
      : [];
  const actionableAlerts = lineupAlerts.filter(a => !a.locked);

  const viewingName = users.find(u => u.user_id === viewedTeamId);
  const canSetMyTeam = !!viewedTeamId && myTeam?.ownerId !== viewedTeamId;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.leagueLabel}>LEAGUE</Text>
          {/* Tap the league name to switch leagues */}
          <Menu
            visible={leagueMenuOpen}
            onDismiss={() => setLeagueMenuOpen(false)}
            anchor={
              <TouchableOpacity
                style={styles.leagueSwitch}
                onPress={() => setLeagueMenuOpen(true)}
                accessibilityLabel="Switch league"
              >
                <Text style={styles.title} numberOfLines={1}>
                  {league?.name ?? leagues.find(l => l.leagueId === activeLeagueId)?.name ?? 'League'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.text} />
              </TouchableOpacity>
            }
          >
            {leagues.map(l => (
              <Menu.Item
                key={l.leagueId}
                title={l.name}
                leadingIcon="trophy-outline"
                trailingIcon={l.leagueId === activeLeagueId ? 'check' : undefined}
                onPress={() => {
                  setLeagueMenuOpen(false);
                  if (l.leagueId !== activeLeagueId) setActiveLeagueId(l.leagueId);
                }}
              />
            ))}
            <Menu.Item
              title="Add or manage leagues"
              leadingIcon="plus"
              onPress={() => {
                setLeagueMenuOpen(false);
                setShowLeaguesModal(true);
              }}
            />
          </Menu>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={handleRefresh} accessibilityLabel="Refresh league data">
          <Ionicons name="refresh" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* CONTROLS: team, season, week */}
      <View style={styles.controlsCard}>
        <Text style={styles.controlLabel}>TEAM</Text>
        <FlatList
          horizontal
          data={users}
          keyExtractor={(u) => u.user_id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
          renderItem={({ item }) => {
            const selected = viewedTeamId === item.user_id;
            const mine = myTeam?.ownerId === item.user_id;
            return (
              <TouchableOpacity style={[styles.chip, selected && styles.chipOn]} onPress={() => setViewedTeamId(item.user_id)}>
                {mine && <Ionicons name="star" size={12} color={selected ? colors.onPrimary : colors.warning} />}
                <Text style={[styles.chipText, selected && styles.chipTextOn]} numberOfLines={1}>{getTeamName(item)}</Text>
              </TouchableOpacity>
            );
          }}
        />
        {canSetMyTeam && (
          <TouchableOpacity
            style={styles.setMineRow}
            onPress={async () => {
              const selectedTeam = buildMyTeam(viewedTeamId!);
              if (selectedTeam) await setMyTeam(selectedTeam);
            }}
          >
            <Ionicons name="star-outline" size={14} color={colors.primary} />
            <Text style={styles.setMineText}>
              Make {viewingName ? getTeamName(viewingName) : 'this team'} my team
            </Text>
          </TouchableOpacity>
        )}
        {!myTeam && !canSetMyTeam && (
          <Text style={styles.hint}>Pick your team above and tap "Make … my team" to unlock alerts, trade ideas and AI advice.</Text>
        )}

        <View style={styles.pickerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.controlLabel}>SEASON</Text>
            {loadingSeasons ? (
              <Text style={styles.hint}>Loading…</Text>
            ) : (
              <Picker
                selectedValue={selectedSeasonLeagueId}
                style={styles.picker}
                dropdownIconColor={colors.text}
                onValueChange={(itemValue) => {
                  setSelectedSeasonLeagueId(itemValue);
                  setViewedTeamId(null); // Reset viewed team when changing season
                }}
              >
                {availableSeasons.map((season) => (
                  <Picker.Item key={season.league_id} label={String(season.season)} value={season.league_id} color={colors.text} />
                ))}
              </Picker>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.controlLabel}>WEEK</Text>
            <Picker
              selectedValue={selectedWeek}
              style={styles.picker}
              dropdownIconColor={colors.text}
              onValueChange={(itemValue) => setSelectedWeek(clampWeek(Number(itemValue)))}
            >
              {[...Array(MAX_FANTASY_WEEK_VISIBLE)].map((_, i) => (
                <Picker.Item key={i + 1} label={`Week ${i + 1}`} value={i + 1} color={colors.text} />
              ))}
            </Picker>
          </View>
          <View style={styles.resultBox}>
            <Text style={styles.resultPoints}>{(viewedRoster ? mySide.total : points).toFixed(2)}</Text>
            <Text style={[styles.resultText, { color: resultColor }]} numberOfLines={2}>{result}</Text>
          </View>
        </View>
      </View>

      {/* LINEUP ALERTS (bye weeks / injuries / empty slots) */}
      {isViewingMyTeam && weekStatus !== 'completed' && (
        <View style={[styles.alertBox, lineupAlerts.length === 0 && styles.alertBoxOk]}>
          <View style={styles.alertHeader}>
            <Ionicons
              name={actionableAlerts.length ? 'warning' : lineupAlerts.length ? 'medkit-outline' : 'checkmark-circle'}
              size={16}
              color={actionableAlerts.length ? colors.warning : lineupAlerts.length ? colors.danger : colors.success}
            />
            <Text style={styles.alertTitle}>
              {actionableAlerts.length
                ? `${lineupAlerts.length} lineup ${lineupAlerts.length === 1 ? 'issue' : 'issues'} for week ${selectedWeek}`
                : lineupAlerts.length
                  ? `In-game injury update for week ${selectedWeek}`
                  : `Your starters are all set for week ${selectedWeek}`}
            </Text>
          </View>
          {lineupAlerts.map((alert, i) => (
            <Text key={`${alert.playerId ?? alert.slot}-${i}`} style={[styles.alertLine, (alert.kind === 'out' || alert.kind === 'empty' || alert.kind === 'bye' || alert.kind === 'hurt_in_game') && styles.alertLineSevere]}>
              • {alert.message}
            </Text>
          ))}
        </View>
      )}

      {/* LINEUP CHECK (your team, current season) */}
      {isViewingMyTeam && isCurrentSeason && weekStatus !== 'completed' && myTeam && (
        <TouchableOpacity style={styles.checkBtn} onPress={() => setShowLineupCheck(true)}>
          <Ionicons name="clipboard-outline" size={16} color={colors.primary} />
          <Text style={styles.checkBtnText}>Lineup check: compare with the best lineup for this week</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
      {myTeam && activeLeagueId && (
        <LineupCheckSheet
          visible={showLineupCheck}
          team={{ ...myTeam, rosterId: rosters.find(r => r.owner_id === myTeam.ownerId)?.roster_id ?? myTeam.rosterId }}
          leagueId={activeLeagueId}
          onClose={() => setShowLineupCheck(false)}
          onAskAI={q => navigation.navigate('MainTabs', { screen: 'ChatBot', params: { ask: q, leagueId: activeLeagueId, nonce: Date.now() } } as any)}
        />
      )}

      {/* IR ADVICE (your team only) */}
      {isViewingMyTeam && irAdvice && (irAdvice.shouldMove.length > 0 || irAdvice.onIr.length > 0 || (irAdvice.locked?.length ?? 0) > 0) && (() => {
        const open = Math.max(0, irAdvice.irSlots - irAdvice.irSlotsUsed);
        const injuryOf = (id: string) => currentInjury(injuryIndex, { ...(players[id] ?? {}), player_id: id }).injury;
        return (
          <View style={styles.irCard}>
            <View style={styles.alertHeader}>
              <Ionicons name="medkit" size={16} color={colors.danger} />
              <Text style={[styles.alertTitle, { flex: 1 }]}>Injured reserve</Text>
              <Text style={styles.irSlots}>
                {irAdvice.irSlots > 0 ? `${irAdvice.irSlotsUsed} of ${irAdvice.irSlots} IR spots used` : 'No IR spots in this league'}
              </Text>
            </View>
            {(irAdvice.locked ?? []).map(l => (
              <View key={l.player.id} style={styles.lockBox}>
                <Text style={styles.lockTitle}>
                  <Ionicons name="lock-closed" size={13} color={colors.danger} /> Your Sleeper roster is locked
                </Text>
                <Text style={styles.alertLine}>
                  <Text style={{ fontWeight: '800' }}>{l.player.name}</Text> is in an IR spot but is now{' '}
                  {l.player.injuryStatus && l.player.injuryStatus !== 'ACTIVE' ? irStatusWord(l.player.injuryStatus) : 'healthy'}, so he isn't IR-eligible.
                  Sleeper blocks adds, waiver claims and roster moves until he leaves the IR spot.
                </Text>
                <Text style={styles.alertLine}>
                  Fix: {l.drop ? <>drop <Text style={{ fontWeight: '800' }}>{l.drop.name}</Text> ({l.drop.position}, {l.drop.value.toFixed(1)} pts/game, the smallest hit to your lineup), then </> : 'make room on your bench, then '}
                  move {l.player.name} from IR to your bench.
                  {l.netGain !== null && l.netGain > 0 ? ` Your lineup gets +${l.netGain.toFixed(1)} pts/week with him back.` : ''}
                </Text>
              </View>
            ))}
            {irAdvice.shouldMove.map((p, i) => {
              const injury = injuryOf(p.id);
              const canMove = i < open;
              return (
                <Text key={p.id} style={styles.alertLine}>
                  • <Text style={{ fontWeight: '800' }}>{p.name}</Text> ({p.position}{p.team ? `, ${p.team}` : ''}) is {irStatusWord(p.injuryStatus)}
                  {injury ? ` · ${injury}` : ''}.{' '}
                  {canMove
                    ? 'Move him to an IR spot in Sleeper to free a bench spot.'
                    : irAdvice.irSlots === 0
                      ? "Your league doesn't have IR spots, so he takes a bench spot until he's back."
                      : open > 0
                        ? `Your open IR spot is better used on ${irAdvice.shouldMove[0].name}, so he stays on your bench for now.`
                        : 'Your IR spots are full; he stays on your bench for now.'}
                  {canMove && p.note ? <Text style={styles.irNote}>{` ${p.note}`}</Text> : null}
                </Text>
              );
            })}
            {irAdvice.shouldMove.length > 0 && open > 0 && (
              <Text style={styles.hint}>
                In Sleeper: open your team, tap the position button next to his name, then tap the IR spot.
              </Text>
            )}
            {irAdvice.pickups.length > 0 && (
              <>
                <Text style={[styles.alertTitle, { marginTop: 6, fontSize: 13 }]}>Then pick up</Text>
                {irAdvice.pickups.map(({ add, netGain }) => (
                  <Text key={add.id} style={styles.alertLine}>
                    • {add.name} ({add.position}{add.team ? `, ${add.team}` : ''}) · {add.value.toFixed(1)} pts/game
                    {netGain > 0 ? ` · makes your lineup +${netGain.toFixed(1)} pts/week` : ' · depth for your bench'}
                  </Text>
                ))}
              </>
            )}
            {irAdvice.shouldMove.length === 0 && !(irAdvice.locked?.length) && (
              <Text style={styles.alertLine}>
                {irAdvice.onIr.map(p => p.name).join(', ')} {irAdvice.onIr.length === 1 ? 'is' : 'are'} in your IR spots. Nobody else needs to move.
              </Text>
            )}
          </View>
        );
      })()}

      {/* LIVE SCOREBOARD + WIN ODDS */}
      {liveEligible && weekStatus !== 'completed' && (
        <LiveScoreboard
          board={liveBoard}
          loading={liveLoading}
          error={liveError}
          onRefresh={() => setLiveNonce(n => n + 1)}
        />
      )}

      {/* VIEW MODE */}
      <View style={styles.segment}>
        {([['team', 'Roster'], ['both', 'Matchup']] as const).map(([mode, label]) => (
          <TouchableOpacity
            key={mode}
            style={[styles.segmentBtn, viewMode === mode && styles.segmentBtnOn]}
            onPress={() => setViewMode(mode)}
          >
            <Text style={[styles.segmentText, viewMode === mode && styles.segmentTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <LeaguesModal visible={showLeaguesModal} onClose={() => setShowLeaguesModal(false)} />

      {/* PLAYER LIST */}
      {viewedRoster && (
        viewMode === 'team' ? renderRoster(mySide) :
        !oppSide ? <Text style={styles.hint}>No opponent found for this week.</Text> :
        renderSideBySide(mySide, oppSide)
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, backgroundColor: c.background },
  loadingText: { marginTop: 10, color: c.textMuted },

  emptyCard: { width: '100%' as const, maxWidth: 420, backgroundColor: c.surface, borderRadius: radius.lg, padding: 22, borderWidth: 1, borderColor: c.border, alignItems: 'center' as const, gap: 10 },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: c.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyTitle: { fontSize: 20, fontWeight: '800' as const, color: c.text },
  emptyText: { fontSize: 13, color: c.textMuted, textAlign: 'center' as const, lineHeight: 19 },
  emptyInput: { width: '100%' as const, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted, color: c.text, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  primaryBtn: { width: '100%' as const, backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' as const },
  primaryBtnText: { color: c.onPrimary, fontWeight: '800' as const, fontSize: 15 },

  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 12, gap: 12 },
  leagueLabel: { fontSize: 11, fontWeight: '800' as const, color: c.textMuted, letterSpacing: 0.8 },
  title: { fontSize: 24, fontWeight: '800' as const, color: c.text, flexShrink: 1 },
  leagueSwitch: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, alignSelf: 'flex-start' as const, maxWidth: '100%' as const },
  addError: { color: c.danger, fontSize: 12, textAlign: 'center' as const },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },

  controlsCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: c.border, gap: 6 },
  controlLabel: { fontSize: 10, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8, marginBottom: 4 },
  chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.surfaceMuted, borderRadius: radius.pill, maxWidth: 220 },
  chipOn: { backgroundColor: c.primary },
  chipText: { fontSize: 13, fontWeight: '600' as const, color: c.text },
  chipTextOn: { color: c.onPrimary, fontWeight: '800' as const },
  setMineRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginTop: 4, alignSelf: 'flex-start' as const },
  setMineText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  hint: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
  pickerRow: { flexDirection: 'row' as const, gap: 10, marginTop: 8, alignItems: 'flex-end' as const },
  picker: { height: 40, color: c.text, backgroundColor: c.surfaceMuted, borderWidth: 0, borderRadius: radius.sm, paddingHorizontal: 6 },
  resultBox: { flex: 0.9, alignItems: 'flex-end' as const, justifyContent: 'center' as const, minHeight: 40 },
  resultPoints: { fontSize: 20, fontWeight: '800' as const, color: c.text },
  resultText: { fontSize: 12, fontWeight: '700' as const, textAlign: 'right' as const },

  alertBox: { backgroundColor: c.warningSoft, borderRadius: radius.md, padding: 12, marginTop: 12, gap: 4 },
  alertBoxOk: { backgroundColor: c.successSoft },
  irCard: { backgroundColor: c.surface, borderRadius: radius.md, padding: 12, marginTop: 12, gap: 4, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: c.danger },
  irSlots: { fontSize: 11, fontWeight: '700' as const, color: c.textMuted },
  irNote: { color: c.textMuted, fontSize: 12 },
  emptyRow: { paddingVertical: 12, paddingHorizontal: 16, gap: 10, backgroundColor: c.dangerSoft },
  emptyBadge: { minWidth: 52, height: 26, borderRadius: 6, borderWidth: 1.5, borderStyle: 'dashed' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 4 },
  emptyBadgeText: { fontWeight: '800' as const, fontSize: 11 },
  emptySlotTitle: { fontSize: 15, fontWeight: '800' as const, color: c.danger },
  emptySlotSub: { fontSize: 12, color: c.text, marginTop: 2, lineHeight: 16 },
  checkBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: c.primarySoft, borderRadius: radius.md, padding: 12, marginTop: 12 },
  checkBtnText: { flex: 1, color: c.primary, fontWeight: '700' as const, fontSize: 13 },
  lockBox: { backgroundColor: c.dangerSoft, borderRadius: radius.sm, padding: 10, gap: 4, marginVertical: 4 },
  lockTitle: { fontWeight: '800' as const, color: c.danger, fontSize: 13 },
  alertHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 2 },
  alertTitle: { fontWeight: '800' as const, color: c.text, fontSize: 14 },
  alertLine: { fontSize: 13, color: c.text },
  alertLineSevere: { color: c.danger, fontWeight: '600' as const },

  segment: { flexDirection: 'row' as const, backgroundColor: c.surfaceMuted, borderRadius: radius.pill, padding: 3, marginTop: 14, alignSelf: 'flex-start' as const },
  segmentBtn: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: radius.pill },
  segmentBtnOn: { backgroundColor: c.surface, ...shadowFor(c) },
  segmentText: { fontSize: 13, fontWeight: '700' as const, color: c.textMuted },
  segmentTextOn: { color: c.text },

  banner: { marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  bannerName: { fontSize: 15, fontWeight: '800' as const, color: c.text },
  bannerPoints: { fontSize: 22, fontWeight: '800' as const, color: c.text },
  bannerOutcome: { fontSize: 13, fontWeight: '800' as const, color: '#fff' },
  sectionLabel: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
  listCard: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' as const },
  playerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, borderBottomWidth: 1, borderBottomColor: c.border },
});
