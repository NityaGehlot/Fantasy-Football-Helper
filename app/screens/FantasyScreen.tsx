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
  getLeagueHistory
} from '../services/sleeperAPI';

// >>> ADDED
import { getPlayerStatsByWeek } from '../services/nflApi';
import { useFantasy } from "../context/FantasyContext";

import { Picker } from '@react-native-picker/picker';
import { User, Roster } from '../types';
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../AppNavigator";

export default function FantasyScreen() {
  const [league, setLeague] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [players, setPlayers] = useState<any>({});
  const [matchups, setMatchups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [weekMatchups, setWeekMatchups] = useState<any[]>([]);
  const [leagueInput, setLeagueInput] = useState("");
  const [addingLeague, setAddingLeague] = useState(false);
  const [newLeagueInput, setNewLeagueInput] = useState("");
  const [availableSeasons, setAvailableSeasons] = useState<Array<{ league_id: string; season: number; name: string }>>([]);
  const [selectedSeasonLeagueId, setSelectedSeasonLeagueId] = useState<string>("");
  const [loadingSeasons, setLoadingSeasons] = useState(false);
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
  const { activeLeagueId, addLeague } = useFantasy();


  // =====================
// TEMP: No league added yet
// =====================
if (!activeLeagueId) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 18, marginBottom: 12 }}>
        You don't have a league selected yet.
      </Text>
      <TextInput
        placeholder="Enter League ID"
        value={newLeagueInput}
        onChangeText={setNewLeagueInput}
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          padding: 10,
          borderRadius: 8,
          width: "80%",
          marginBottom: 12,
        }}
      />
      <Pressable
        style={{
          backgroundColor: "#4f46e5",
          padding: 12,
          borderRadius: 8,
          width: "50%",
          alignItems: "center",
        }}
        onPress={async () => {
          if (!newLeagueInput.trim()) return;
          setAddingLeague(true);
          try {
            await addLeague(newLeagueInput.trim());
            setNewLeagueInput("");
          } catch (err) {
            console.error("Error adding league:", err);
          } finally {
            setAddingLeague(false);
          }
        }}
      >
        <Text style={{ color: "#fff" }}>{addingLeague ? "Adding..." : "Add League"}</Text>
      </Pressable>
    </View>
  );
}


  // =====================
  // Load league history (seasons)
  // =====================
  useEffect(() => {
    if (!activeLeagueId) return;

    const loadSeasons = async () => {
      setLoadingSeasons(true);
      try {
        console.log('🔍 Loading league history for:', activeLeagueId);
        const history = await getLeagueHistory(activeLeagueId);
        console.log('✅ Found seasons:', history.map(h => h.season));
        setAvailableSeasons(history);
        // Auto-select the most recently completed season (season year < current year)
        const currentYear = new Date().getFullYear();
        const completedSeason = history.find(h => Number(h.season) < currentYear);
        const defaultSeason = completedSeason ?? history[0];
        if (defaultSeason) {
          setSelectedSeasonLeagueId(defaultSeason.league_id);
        }
      } catch (err) {
        console.error('Error loading league history:', err);
      } finally {
        setLoadingSeasons(false);
      }
    };

    loadSeasons();
  }, [activeLeagueId]);

  // Load Sleeper + NFL stats JSON together
useEffect(() => {
  if (!selectedSeasonLeagueId) return;
  const leagueId: string = selectedSeasonLeagueId;

  const load = async () => {
    setLoading(true);
    try {
      const [
        leagueData,
        usersData,
        rostersData,
        playersData,
        matchupsData,
        statsThisWeek        // ✅ renamed from stats2025
      ] = await Promise.all([
        getLeague(leagueId),
        getLeagueUsers(leagueId),
        getRosters(leagueId),
        getPlayers(),
        getMatchups(leagueId, selectedWeek),
        getPlayerStatsByWeek(selectedWeek)  // ✅ fetches the selected week's file
      ]);

      setLeague(leagueData);
      setUsers(usersData);
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
          // ✅ Preserve injury fields as strings, don't cast to Number
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
      setLoading(false);
    }
  };

  load();
}, [selectedSeasonLeagueId, selectedWeek]); // ✅ re-runs on season or week change





  useEffect(() => {
    async function loadWeek() {
      if (!activeLeagueId) return;
      setLoading(true);
      try {
        const weekData = await getMatchups(activeLeagueId, selectedWeek);
        setWeekMatchups(weekData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadWeek();
  }, [selectedWeek]);

  const getTeamName = (user: User) =>
    user.metadata.team_name || user.display_name;

  const myRoster = rosters.find((r) => r.owner_id === myTeamId);

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
    if (!myRoster || !weekMatchups) return 0;
    const myMatchup = weekMatchups.find(m => m.roster_id === myRoster.roster_id);
    return myMatchup?.players_points?.[playerId] ?? 0;
  };

  const getTeamWeeklyResult = () => {
    if (!myRoster || !weekMatchups) return { points: 0, result: '-' };
    const myMatchup = weekMatchups.find(m => m.roster_id === myRoster.roster_id);
    if (!myMatchup) return { points: 0, result: '-' };
    const totalPoints = (myMatchup.starters_points || []).reduce((a: any, b: any) => a + b, 0);

    const opponent = weekMatchups.find(
      m => m.matchup_id === myMatchup.matchup_id && m.roster_id !== myRoster.roster_id
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
  if (sleeperPlayer.position === "DEF") {
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
      p.position === sleeperPlayer.position
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
  console.log("DEBUG stats object:", stats);

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Loading Sleeper + NFL stats...</Text>
      </View>
    );
  }

  /** Use actual players from the selected week's matchup */
  const myWeekMatchup = weekMatchups.find(m => m.roster_id === myRoster?.roster_id);
  const starterIds = myWeekMatchup?.starters || [];
  const allIds = myWeekMatchup?.players || [];
  const enrichedPlayers = allIds.map((id: string | number) => ({ ...players[id], player_id: id }));
  const sortedList = sortPlayers(enrichedPlayers, starterIds);
  const startersList = sortedList.filter(p => starterIds.includes(p.player_id));
  const benchList = sortedList.filter(p => !starterIds.includes(p.player_id));
  const getTeamLogo = (teamAbbrev: string) => {
    if (!teamAbbrev) return 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
    return `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${teamAbbrev.trim()}`;
  };

  const renderPlayerRow = (player: any) => {
  const stats = getPlayerNFLStats(player.player_id, selectedWeek);
  const statLine = formatPlayerStats(player.position, stats);

  // ✅ Normalize to uppercase for comparison
  const injuryStatus = String(stats?.injury_status ?? "").toUpperCase().trim();
  const injuryType =
    stats?.primary_injury ||
    stats?.practice_primary_injury ||
    stats?.secondary_injury ||
    "";

  const isOut = ["OUT", "IR", "IR-R", "INJURED RESERVE"].includes(injuryStatus);
  const isQuestionable = ["QUESTIONABLE", "DOUBTFUL"].includes(injuryStatus);
  const hasInjuryConcern = isOut || isQuestionable;
  const statusLabel = isOut ? "(Out)" : isQuestionable ? "(Questionable)" : "";

  return (
    <TouchableOpacity
      key={player.player_id}
      style={styles.playerRow}
      onPress={() =>
        navigation.navigate("PlayerDetails", {
          player,
          stats,
          week: selectedWeek,
          fantasyPoints: getPointsThisWeek(player.player_id)
        })
      }
    >
      <View style={[styles.positionBadgeRect, { backgroundColor: getPositionColor(player.position) }]}>
        <Text style={styles.positionBadgeText}>{player.position}</Text>
      </View>

      <Image
        source={{
          uri:
            player.position === "DEF"
              ? getTeamLogo(stats?.team || player.team)
              : getHeadshotUrl(player)
        }}
        style={styles.playerImage}
      />

      <View style={{ marginLeft: 10, flex: 1 }}>

        {/* ✅ Name + injury badge */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.playerName}>{player.full_name}</Text>
          {isOut && (
            <View style={{ backgroundColor: "#e53e3e", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>O</Text>
            </View>
          )}
          {isQuestionable && (
            <View style={{ backgroundColor: "#d69e2e", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Q</Text>
            </View>
          )}
          {statusLabel ? (
            <Text style={{ fontSize: 12, color: isOut ? "#e53e3e" : "#d69e2e", fontWeight: "600" }}>
              {statusLabel}
            </Text>
          ) : null}
        </View>

        <Text style={styles.playerSubText}>{player.position} • {stats.team}</Text>

        <View style={{ marginTop: 4 }}>
          {hasInjuryConcern && injuryType ? (
            <Text style={{ fontSize: 12, color: isOut ? "#e53e3e" : "#d69e2e", marginBottom: 4 }}>
              {injuryType}
            </Text>
          ) : null}
          {statLine && statLine.length > 0 ? (
            statLine.map((line, index) => (
              <Text key={index} style={[styles.statLine, { marginTop: index === 0 ? 0 : 2 }]}> 
                {line}
              </Text>
            ))
          ) : (
            <Text style={styles.statLine}>No stats recorded</Text>
          )}
        </View>

      </View>

      <View style={styles.playerStats}>
        <Text style={styles.statText}>{getPointsThisWeek(player.player_id).toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  );
};


  const { points, result } = getTeamWeeklyResult();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>League Nameeee: {league?.name}</Text>

      {/* ========================= NEW TEST BLOCK ========================= */}
      {/* Verify NFL data is loaded */}
      {playerStats2025 && (
        <Text style={{ fontSize: 14, color: '#444', marginBottom: 8 }}>
          NFL Stats Loaded: {playerStats2025.length} players 📊
        </Text>
      )}
      {/* ================================================================ */}

      {/* TEAM SELECTOR */}
      <Text style={styles.subTitle}>Select Your Team</Text>
      <View style={{ height: 50 }}>
        <FlatList
          horizontal
          data={users}
          keyExtractor={(u) => u.user_id}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.teamButton, myTeamId === item.user_id && styles.teamSelected]}
              onPress={() => setMyTeamId(item.user_id)}
            >
              <Text style={[styles.teamText, myTeamId === item.user_id && styles.teamTextSelected]}>
                {getTeamName(item)}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* WEEK + RESULTS */}
      <View style={styles.weekContainer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.weekLabel}>Select Season:</Text>
          {loadingSeasons ? (
            <Text style={{ color: '#666', padding: 10 }}>Loading seasons...</Text>
          ) : (
            <Picker
              selectedValue={selectedSeasonLeagueId}
              style={{ height: 40 }}
              onValueChange={(itemValue) => {
                setSelectedSeasonLeagueId(itemValue);
                setMyTeamId(null); // Reset team selection when changing season
              }}
            >
              {availableSeasons.map((season) => (
                <Picker.Item key={season.league_id} label={season.name} value={season.league_id} />
              ))}
            </Picker>
          )}
        </View>
        
        <View style={{ flex: 1 }}>
          <Text style={styles.weekLabel}>Select Week:</Text>
          <Picker
            selectedValue={selectedWeek}
            style={{ height: 40 }}
            onValueChange={(itemValue) => setSelectedWeek(itemValue)}
          >
            {[...Array(18)].map((_, i) => (
              <Picker.Item key={i + 1} label={`Week ${i + 1}`} value={i + 1} />
            ))}
          </Picker>
        </View>
        
        <View style={styles.weekResults}>
          <Text style={styles.resultText}>Team Points: {points.toFixed(2)}</Text>
          <Text style={[styles.resultText, { color: result === 'WIN' ? 'green' : result === 'LOSS' ? 'red' : 'orange' }]}>
            {result}
          </Text>
        </View>
      </View>

      {/* HEADER */}
      <View style={styles.statsHeader}>
        <View style={{ width: 45 }} />
        <View style={{ width: 50 }} />
        <View style={{ flex: 1 }} />
        <View style={styles.playerStats}>
          <Text style={styles.statText}>PTS</Text>
        </View>
      </View>

      {/* PLAYER LIST */}
      {myRoster && (
        <ScrollView style={{ flex: 1 }}>
          <Text style={styles.subTitle}>Starters</Text>
          {startersList.map(renderPlayerRow)}

          <Text style={styles.subTitle}>Bench</Text>
          {benchList.map(renderPlayerRow)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 20 },
  subTitle: { fontSize: 20, fontWeight: '600', marginTop: 15, marginBottom: 10 },

  teamButton: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#eee', borderRadius: 10, marginRight: 10 },
  teamSelected: { backgroundColor: '#4f46e5' },
  teamText: { fontSize: 16, color: '#000' },
  teamTextSelected: { color: '#fff', fontWeight: 'bold' },

  weekContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#f2f2f2', borderRadius: 10, marginTop: 15, alignItems: 'flex-start' },
  weekLabel: { fontWeight: '600', marginBottom: 5, fontSize: 12 },
  weekResults: { marginLeft: 10, flex: 0.8, justifyContent: 'center' },
  resultText: { fontSize: 14, fontWeight: '700' },

  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  playerImage: { width: 50, height: 50, borderRadius: 25 },
  playerName: { fontSize: 16, fontWeight: '600' },
  playerSubText: { fontSize: 14, color: '#555' },
  positionBadgeRect: { width: 45, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  positionBadgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingRight: 14 },
  playerStats: { flexDirection: 'row', width: 50 },
  statText: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  statLine: { fontSize: 12, color: '#333' },

});
