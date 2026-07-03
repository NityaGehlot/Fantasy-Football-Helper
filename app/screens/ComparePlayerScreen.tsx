import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../AppNavigator";

import { getPlayersFromGithub } from "../services/sleeperAPI";
import { getPlayerStatsByWeek } from "../services/nflApi";

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "ComparePlayer"
>;

export default function ComparePlayerScreen({ route }: any) {
  const navigation = useNavigation<NavigationProp>();
  const player = route?.params?.player ?? null;
  // Support entry with no initial player: allow user to pick two players from this screen
  const [playerOne, setPlayerOne] = useState<any>(player || null);

  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [playerOneStats, setPlayerOneStats] = useState<any>(null);
  const [playerTwoStats, setPlayerTwoStats] = useState<any>(null);

  const [loadingStatsOne, setLoadingStatsOne] = useState<boolean>(false);
  const [loadingStatsTwo, setLoadingStatsTwo] = useState<boolean>(false);

  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<"season" | "week">("season");
  const [selectedWeek, setSelectedWeek] = useState(1);

  const getHeadshot = (p: any) => {
    if (p?.espn_id)
      return `https://a.espncdn.com/i/headshots/nfl/players/full/${p.espn_id}.png`;

    if (p?.player_id)
      return `https://sleepercdn.com/content/nfl/players/thumb/${p.player_id}.jpg`;

    return "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg";
  };

  function getPositionGroup(pos: string | undefined) {
    const p = (pos || "").toUpperCase().trim();

    if (!p) return "OTHER";

    // WR and TE are comparable
    if (p === "WR" || p === "TE") return "WRTE";

    // Defensive line group
    if (p === "DT" || p === "DE" || p === "DL" || p === "NT") return "DL";

    // Defensive backs group (CB, S, FS, SS, DB)
    if (p === "CB" || p === "S" || p === "FS" || p === "SS" || p === "DB") return "DB";

    // Keep common single-letter positions grouped normally
    if (p === "QB") return "QB";
    if (p === "RB") return "RB";
    if (p === "K") return "K";
    if (p === "DEF") return "DEF";

    return p;
  }

  function canCompare(aPos: string | undefined, bPos: string | undefined) {
    return getPositionGroup(aPos) === getPositionGroup(bPos);
  }

  const normalizeName = (value?: string) => String(value || "").trim().toLowerCase();

  const isIndividualDefensivePosition = (position: string) => {
    const pos = String(position || '').toUpperCase().trim();
    return [
      "DL",
      "DE",
      "DT",
      "EDGE",
      "LB",
      "ILB",
      "OLB",
      "CB",
      "DB",
      "S",
      "SS",
      "FS",
    ].includes(pos);
  };

  const getPlayerNFLStats = (playerId: string | number, week: number, playerStatsData: any[]) => {
    if (!playerStatsData) return null;

    const sleeperPlayer = currentPlayerForMatch || player; // fallback to main player

    const weekMatches = playerStatsData.filter(
      (p: any) => Number(String(p.week).trim()) === Number(week)
    );

    if (sleeperPlayer.position === "DEF") {
      const defId = `DEF_${sleeperPlayer.team}`;
      return weekMatches.find((p: any) => String(p.player_id) === defId) || null;
    }

    const idMatch = weekMatches.find(
      (p: any) => String(p.player_id) === String(playerId)
    );
    if (idMatch) return idMatch;

    const fullName = sleeperPlayer.full_name?.toLowerCase().trim();
    if (!fullName) return null;
    const sleeperPosition = String(sleeperPlayer.position || "").toUpperCase().trim();
    const sleeperTeam = String(sleeperPlayer.team || "").toUpperCase().trim();

    const normalize = (name: string) =>
      String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ');

    const normalizedFullName = normalize(fullName);

    const isDefensiveIndividual = isIndividualDefensivePosition(sleeperPosition);

    const byName = (p: any) => normalize(p?.player_name) === normalizedFullName;
    const byPartialName = (p: any) => {
      const jsonName = normalize(p?.player_name);
      if (!jsonName) return false;
      return jsonName.includes(normalizedFullName) || normalizedFullName.includes(jsonName);
    };
    const byTeam = (p: any) => {
      if (!sleeperTeam) return true;
      return String(p?.team || "").toUpperCase().trim() === sleeperTeam;
    };

    if (isDefensiveIndividual) {
      const defenseExact = weekMatches.find((p: any) => byName(p) && byTeam(p));
      if (defenseExact) return defenseExact;

      const defensePartial = weekMatches.find((p: any) => byPartialName(p) && byTeam(p));
      if (defensePartial) return defensePartial;

      const defenseNameOnly = weekMatches.find((p: any) => byName(p) || byPartialName(p));
      if (defenseNameOnly) return defenseNameOnly;
    }

    const nameTeamMatch = weekMatches.find((p: any) => byName(p) && byTeam(p));
    if (nameTeamMatch) return nameTeamMatch;

    const namePositionMatch = weekMatches.find(
      (p: any) => byName(p) && String(p?.position || "").toUpperCase().trim() === sleeperPosition
    );
    if (namePositionMatch) return namePositionMatch;

    const nameOnlyMatch = weekMatches.find((p: any) => byName(p));
    if (nameOnlyMatch) return nameOnlyMatch;

    const partialTeamMatch = weekMatches.find((p: any) => byPartialName(p) && byTeam(p));
    if (partialTeamMatch) return partialTeamMatch;

    const nameMatch = weekMatches.find(
      (p: any) => byPartialName(p) && String(p?.position || "").toUpperCase().trim() === sleeperPosition
    );

    return nameMatch || null;
  };

  // helper to allow getPlayerNFLStats to use the current comparing player when matching for loadStats
  let currentPlayerForMatch: any = null;

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    if (playerOne) loadStats(playerOne, true);
  }, [playerOne]);

  useEffect(() => {
    if (selectedPlayer) {
      loadStats(selectedPlayer, false);
    }
  }, [selectedPlayer]);

  async function loadPlayers() {
    const players = await getPlayersFromGithub();

    const arr = Object.values(players || {}).filter(
      (p: any) =>
        p.position &&
        p.full_name &&
        p.team
    );

    arr.sort((a: any, b: any) =>
      a.full_name.localeCompare(b.full_name)
    );

    // Also pull team-defense rows from the week1 stats and add them as selectable players
    try {
      const weekStats = await getPlayerStatsByWeek(1);
      const defRows = (weekStats || []).filter((r: any) => String(r.player_id || '').startsWith('DEF_'));

      defRows.forEach((d: any) => {
        const exists = arr.find((p: any) => String(p.player_id) === String(d.player_id));
        if (!exists) {
          arr.push({
            player_id: d.player_id,
            full_name: d.player_name || `${d.team} DEF`,
            position: 'DEF',
            team: d.team || String(d.player_name || '').split(' ')[0],
            espn_id: undefined,
          });
        }
      });

      arr.sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
    } catch (err) {
      console.warn('Failed to load defense team rows for selection:', err);
    }

    setAllPlayers(arr);

    setLoading(false);
  }

  async function loadStats(currentPlayer: any, first: boolean) {
    if (first) setLoadingStatsOne(true);
    else setLoadingStatsTwo(true);

    currentPlayerForMatch = currentPlayer;

    try {
      let totals: any = {};
      let gamesCount = 0;
      let byeCount = 0;
      let eliminatedCount = 0;

      for (let week = 1; week <= 22; week++) {
        const stats = await getPlayerStatsByWeek(week);

        const row = getPlayerNFLStats(currentPlayer.player_id, week, stats);

        if (!row) continue;

        // Count played games using `game_played` flag (explicit)
        if (row?.game_played) {
          gamesCount++;
        }

        const teamStatus = String(row?.team_status ?? '').toLowerCase().trim();
        if (teamStatus === 'bye-week') byeCount++;
        if (teamStatus === 'eliminated') eliminatedCount++;

        Object.keys(row).forEach((key) => {
          const value = Number(row[key]);

          if (!isNaN(value)) {
            totals[key] = (totals[key] || 0) + value;
          }
        });
      }

      // Normalize fumble recovery totals: some feeds use `fumble_recovery_opp`
      totals.fumbles_recovered = (totals.fumbles_recovered || 0) + (totals.fumble_recovery_opp || 0);

      totals.games = gamesCount;
      totals.bye_weeks = byeCount;
      totals.eliminated_weeks = eliminatedCount;

      if (first) setPlayerOneStats(totals);
      else setPlayerTwoStats(totals);
    } finally {
      currentPlayerForMatch = null;
      if (first) setLoadingStatsOne(false);
      else setLoadingStatsTwo(false);
    }
  }

  const filteredPlayers = useMemo(() => {
    if (!search.length) return [];

    const group = getPositionGroup(playerOne?.position || player?.position);
    const applyGroupFilter = Boolean(group && group !== 'OTHER');

    return allPlayers
      .filter((p: any) => {
        if (!p.full_name) return false;
        const matchesQuery = p.full_name.toLowerCase().includes(search.toLowerCase());
        if (!matchesQuery) return false;
        if (!applyGroupFilter) return true; // no position-group restriction
        return getPositionGroup(p.position) === group;
      })
      .slice(0, 15);
  }, [search, allPlayers, playerOne, player]);

  function compareColor(
    one: number,
    two: number,
    lowerIsBetter = false
  ) {
    if (one === two)
      return ["#ececec", "#ececec"];

    if (lowerIsBetter) {
      return one < two
        ? ["#d7f7d7", "#ffe2e2"]
        : ["#ffe2e2", "#d7f7d7"];
    }

    return one > two
      ? ["#d7f7d7", "#ffe2e2"]
      : ["#ffe2e2", "#d7f7d7"];
  }

  function formatNumber(value: any) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    if (Number.isInteger(n)) return String(n);
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function statRows(position: string) {
    switch (position) {
      case "QB":
        return [
          ["Passing Yards", "passing_yards"],
          ["Passing TD", "passing_tds"],
          ["Interceptions", "passing_interceptions", true],
          ["Completions", "completions"],
          ["Attempts", "attempts"],
          ["Rush Yards", "rushing_yards"],
          ["Rush TD", "rushing_tds"],
          ["Fantasy Points", "fantasy_points_ppr"],
        ];

      case "RB":
        return [
          ["Carries", "carries"],
          ["Rush Yards", "rushing_yards"],
          ["Rush TD", "rushing_tds"],
          ["Receptions", "receptions"],
          ["Receiving Yards", "receiving_yards"],
          ["Receiving TD", "receiving_tds"],
          ["Fantasy Points", "fantasy_points_ppr"],
        ];

      case "WR":
      case "TE":
        return [
          ["Targets", "targets"],
          ["Receptions", "receptions"],
          ["Receiving Yards", "receiving_yards"],
          ["Receiving TD", "receiving_tds"],
          ["Fantasy Points", "fantasy_points_ppr"],
        ];

      case "K":
        return [
          ["FG Made", "fg_made"],
          ["FG Attempted", "fg_att"],
          ["XP Made", "pat_made"],
          ["Fantasy Points", "fantasy_points_ppr"],
        ];

      default:
        // For individual defensive positions, omit fantasy points row per user preference.
        const rows: any[] = [
          ["Solo Tackles", "def_tackles_solo"],
          ["Assists", "def_tackles_with_assist"],
          ["Sacks", "def_sacks"],
          ["Interceptions", "def_interceptions"],
          ["Forced Fumbles", "def_fumbles_forced"],
          ["Fumbles Rec", "fumbles_recovered"],
        ];

        if (!isIndividualDefensivePosition(position)) {
          rows.push(["Fantasy Points", "fantasy_points_ppr"]);
        }

        return rows;
    }
  }
    return (
    <ScrollView style={styles.container}>

      {/* Header */}

      <View style={styles.header}>

        <Text style={styles.title}>
          Compare Players
        </Text>

        <Text style={styles.subtitle}>
          Compare season or weekly statistics side-by-side.
        </Text>

      </View>

      {/* Player Cards */}

      <View style={styles.playerRow}>

        <View style={styles.playerCard}>

          {playerOne ? (
            <>
              <Image
                source={{ uri: getHeadshot(playerOne) }}
                style={styles.headshot}
              />

              <Text style={styles.playerName}>{playerOne.full_name}</Text>

              <Text style={styles.playerInfo}>{playerOne.position} • {playerOne.team}</Text>
            </>
          ) : (
            <>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyCircleText}>?</Text>
              </View>

              <Text style={styles.playerName}>Select Player</Text>

              <Text style={styles.playerInfo}>Search below</Text>
            </>
          )}

        </View>

        <View style={styles.playerCard}>

          {selectedPlayer ? (
            <>
              <Image
                source={{ uri: getHeadshot(selectedPlayer) }}
                style={styles.headshot}
              />

              <Text style={styles.playerName}>{selectedPlayer.full_name}</Text>

              <Text style={styles.playerInfo}>{selectedPlayer.position} • {selectedPlayer.team}</Text>
            </>
          ) : (
            <>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyCircleText}>?</Text>
              </View>

              <Text style={styles.playerName}>Select Player</Text>

              <Text style={styles.playerInfo}>Search below</Text>
            </>
          )}

        </View>

      </View>

      {/* Search */}

      <View style={styles.searchSection}>

        <TextInput
          placeholder="Search player..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />

        {search.length > 0 && (

          <FlatList
            data={filteredPlayers}
            keyExtractor={(item: any) => item.player_id}

            keyboardShouldPersistTaps="handled"

            style={styles.searchResults}


            renderItem={({ item }: any) => {
              // If no playerOne selected yet, allow picking any player as first
              // When opened without an initial player, don't enforce position-group filtering
              const group = getPositionGroup(playerOne?.position || player?.position);
              const applyGroupFilter = Boolean(group && group !== 'OTHER');
              const allowed = !applyGroupFilter || canCompare((playerOne || player || {}).position, item.position);

              return (
                <TouchableOpacity
                  style={[styles.searchRow, !allowed && { opacity: 0.5 }]}
                  onPress={() => {
                    if (!allowed) {
                      Alert.alert(
                        "Cannot compare",
                        "You can only compare players of the same position group."
                      );
                      return;
                    }

                    if (!playerOne) {
                      setPlayerOne(item);
                    } else {
                      setSelectedPlayer(item);
                    }
                    setSearch("");
                  }}
                >
                  <Image
                    source={{ uri: getHeadshot(item) }}
                    style={styles.searchHeadshot}
                  />

                  <View>
                    <Text style={styles.searchName}>{item.full_name}</Text>
                    <Text style={styles.searchTeam}>{item.position} • {item.team}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />

        )}

      </View>

      {/* View Toggle */}

      <View style={styles.toggleRow}>

        <TouchableOpacity

          style={[
            styles.toggleButton,
            viewMode === "season" && styles.toggleActive,
          ]}

          onPress={() => setViewMode("season")}

        >

          <Text
            style={[
              styles.toggleText,
              viewMode === "season" && styles.toggleTextActive,
            ]}
          >
            Season
          </Text>

        </TouchableOpacity>

        <TouchableOpacity

          style={[
            styles.toggleButton,
            viewMode === "week" && styles.toggleActive,
          ]}

          onPress={() => setViewMode("week")}

        >

          <Text
            style={[
              styles.toggleText,
              viewMode === "week" && styles.toggleTextActive,
            ]}
          >
            Week
          </Text>

        </TouchableOpacity>

      </View>

      {viewMode === "week" && (

        <ScrollView

          horizontal

          showsHorizontalScrollIndicator={false}

          style={styles.weekSelector}

        >

          {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (

            <TouchableOpacity

              key={week}

              style={[
                styles.weekButton,
                selectedWeek === week && styles.weekButtonActive,
              ]}

              onPress={() => setSelectedWeek(week)}

            >

              <Text
                style={[
                  styles.weekText,
                  selectedWeek === week && styles.weekTextActive,
                ]}
              >
                {week}
              </Text>

            </TouchableOpacity>

          ))}

        </ScrollView>

      )}

      {/* Comparison */}

      {selectedPlayer && (

        <View style={styles.statsContainer}>

          {(loadingStatsOne || loadingStatsTwo) ? (
            <View style={styles.statsLoading}>
              <ActivityIndicator size="large" color="#4f46e5" />
              <Text style={styles.loadingText}>Loading stats…</Text>
            </View>
          ) : (playerOneStats && playerTwoStats) ? (

            <View>
              <Text style={{ textAlign: 'center', color: '#6b7280', paddingVertical: 12 }}>Stats list</Text>

              {/* Games + per-position stat comparison rows */}
              {([['Games', 'games'] as any].concat(statRows((playerOne || player || {}).position || '') as any)).map((row) => {
                const [label, key, lowerIsBetter] = row as any;
                const oneVal = Number(playerOneStats[key] || 0);
                const twoVal = Number(playerTwoStats[key] || 0);
                const [leftColor, rightColor] = compareColor(oneVal, twoVal, !!lowerIsBetter);

                return (
                  <View key={key} style={styles.statCard}>
                    <Text style={styles.statTitle}>{label}</Text>
                    <View style={styles.compareRow}>
                      <View style={[styles.valueBox, { backgroundColor: leftColor }]}> 
                        <Text style={styles.valueText}>{formatNumber(oneVal)}</Text>
                        <Text style={styles.gamesText}>{(playerOne && playerOne.full_name) || 'Player 1'}</Text>
                      </View>

                      <View style={[styles.valueBox, { backgroundColor: rightColor }]}> 
                        <Text style={styles.valueText}>{formatNumber(twoVal)}</Text>
                        <Text style={styles.gamesText}>{selectedPlayer.full_name}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              </View>

          ) : null}

        </View>

      )}

      {!selectedPlayer && (

        <View style={styles.emptyState}>

          <Text style={styles.emptyTitle}>
            Search for another player
          </Text>

          <Text style={styles.emptySubtitle}>
            Start typing above to compare statistics.
          </Text>

        </View>

      )}

    </ScrollView>
  );

}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },

  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
  },

  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: "#6b7280",
  },

  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    marginTop: 10,
  },

  playerCard: {
    width: "48%",
    backgroundColor: "#f8f9fc",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  headshot: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 12,
  },

  emptyCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },

  emptyCircleText: {
    fontSize: 38,
    fontWeight: "700",
    color: "#9ca3af",
  },

  playerName: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    color: "#111827",
  },

  playerInfo: {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 14,
  },

  searchSection: {
    paddingHorizontal: 20,
    marginTop: 22,
  },

  searchInput: {
    backgroundColor: "#f4f6fc",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#dbe1ef",
  },

  searchResults: {
    marginTop: 10,
    maxHeight: 280,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },

  searchHeadshot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
  },

  searchName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },

  searchTeam: {
    color: "#6b7280",
    marginTop: 2,
    fontSize: 13,
  },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    gap: 10,
  },

  toggleButton: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 20,
  },

  toggleActive: {
    backgroundColor: "#4f46e5",
  },

  toggleText: {
    fontWeight: "700",
    color: "#374151",
  },

  toggleTextActive: {
    color: "#ffffff",
  },

  weekSelector: {
    marginTop: 18,
    paddingLeft: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },

  summaryColumn: {
    width: '32%',
    backgroundColor: '#f4f6fc',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e9f2',
  },

  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
  },

  summaryValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  weekButton: {
    backgroundColor: "#eef2ff",
    marginRight: 8,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  weekButtonActive: {
    backgroundColor: "#4f46e5",
  },

  weekText: {
    fontWeight: "700",
    color: "#4f46e5",
  },

  weekTextActive: {
    color: "#ffffff",
  },

  statsContainer: {
    paddingHorizontal: 15,
    marginTop: 24,
    paddingBottom: 30,
  },

  statsLoading: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 8,
    color: "#6b7280",
  },

  gamesText: {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 13,
  },

  statCard: {
    backgroundColor: "#f8f9fc",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  statTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111827",
  },

  compareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  valueBox: {
    width: "48%",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    overflow: "hidden",
  },

  valueText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },

  progressBar: {
    height: 8,
    borderRadius: 6,
    backgroundColor: "#4f46e5",
    alignSelf: "flex-start",
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 70,
    paddingHorizontal: 30,
  },

  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },

  emptySubtitle: {
    marginTop: 8,
    fontSize: 15,
    textAlign: "center",
    color: "#6b7280",
  },

});