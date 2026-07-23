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
  // which player card is currently active for selection: 'one' or 'two'
  const [activeSlot, setActiveSlot] = useState<'one' | 'two' | null>(null);

  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState<boolean>(false);
  const [comparedOnce, setComparedOnce] = useState<boolean>(false);
  const [lastComparedPair, setLastComparedPair] = useState<{one?: string|number, two?: string|number}>({});

  const [viewMode, setViewMode] = useState<"season" | "week">("season");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [statScope, setStatScope] = useState<'regular' | 'post' | 'all'>('regular');

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

    // Linebackers group
    if (p === "LB" || p === "ILB" || p === "MLB" || p === "OLB") return "LB";

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
    const aGroup = getPositionGroup(aPos);
    const bGroup = getPositionGroup(bPos);

    if (aGroup === bGroup) return true;

    // Allow defensive linemen (DL) to be compared with linebackers (LB)
    const dlLbCompatible = (aGroup === 'DL' && bGroup === 'LB') || (aGroup === 'LB' && bGroup === 'DL');
    if (dlLbCompatible) return true;

    return false;
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

  const getPlayerNFLStats = (playerId: string | number, week: number, playerStatsData: any[], sleeperPlayerProp?: any) => {
    if (!playerStatsData) return null;

    const sleeperPlayer = sleeperPlayerProp || currentPlayerForMatch || player; // explicit override preferred

    const weekMatches = playerStatsData.filter(
      (p: any) => Number(String(p.week).trim()) === Number(week)
    );

    const sleeperPosition = String(sleeperPlayer.position_for_FFHelper || sleeperPlayer.position || sleeperPlayer.position_listed_on_sleeper || "").toUpperCase().trim();
    if (sleeperPosition === "DEF") {
      const defId = `DEF_${sleeperPlayer.team}`;
      return weekMatches.find((p: any) => String(p.player_id) === defId) || null;
    }

    const idMatch = weekMatches.find(
      (p: any) => String(p.player_id) === String(playerId)
    );
    if (idMatch) return idMatch;

    const fullName = sleeperPlayer.full_name?.toLowerCase().trim();
    if (!fullName) return null;
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

    const nameTeamMatch = weekMatches.find((p: any) => byName(p) && byTeam(p) && String(p?.position || "").toUpperCase().trim() === sleeperPosition);
    if (nameTeamMatch) return nameTeamMatch;

    const namePositionMatch = weekMatches.find(
      (p: any) => byName(p) && String(p?.position || "").toUpperCase().trim() === sleeperPosition
    );
    if (namePositionMatch) return namePositionMatch;

    const nameOnlyMatch = weekMatches.find((p: any) => byName(p) && String(p?.position || "").toUpperCase().trim() === sleeperPosition);
    if (nameOnlyMatch) return nameOnlyMatch;

    const partialTeamMatch = weekMatches.find((p: any) => byPartialName(p) && byTeam(p) && String(p?.position || "").toUpperCase().trim() === sleeperPosition);
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

  async function loadPlayers() {
    const players = await getPlayersFromGithub();

    // Normalize players to ensure a `position` field exists (some feeds use
    // `position_listed_on_nflreadr` or `position_listed_on_sleeper`). Also
    // keep only entries with a name and team.
    const arr = Object.values(players || {}).map((p: any) => {
      const normalizedPos = (p.position || p.position_for_FFHelper || p.position_listed_on_sleeper || p.position_listed_on_sleeper || '').toString().trim();

      return {
        ...p,
        position: normalizedPos || undefined,
      };
    }).filter((p: any) => p.position && p.full_name && p.team);

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

  async function loadStats(currentPlayer: any, first: boolean, scope: 'regular' | 'post' | 'all' = 'all', weekOverride?: number) {
    if (first) setLoadingStatsOne(true);
    else setLoadingStatsTwo(true);

    currentPlayerForMatch = currentPlayer;

    try {
      let totals: any = {};
      let gamesCount = 0;
      let byeCount = 0;
      let eliminatedCount = 0;

      // determine week range based on scope unless a specific week is requested
      if (typeof weekOverride === 'number') {
        const week = weekOverride;
        const stats = await getPlayerStatsByWeek(week);
        const row = getPlayerNFLStats(currentPlayer.player_id, week, stats, currentPlayer);
        if (row) {
          // played flag
          totals.played = row?.game_played ? 1 : 0;
          // capture an injury/team status string if available
          totals.injury_status = row?.team_status || row?.injury_status || '';

          Object.keys(row).forEach((key) => {
            const value = Number(row[key]);
            if (!isNaN(value)) {
              totals[key] = (totals[key] || 0) + value;
            }
          });
        }
      } else {
        const start = scope === 'post' ? 19 : 1;
        const end = scope === 'regular' ? 18 : 22;

        for (let week = start; week <= end; week++) {
          const stats = await getPlayerStatsByWeek(week);

          const row = getPlayerNFLStats(currentPlayer.player_id, week, stats, currentPlayer);

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

  // Note: removed background preload — stats load only when Compare is pressed

  // Auto-reload stats when user has previously compared this exact pair
  useEffect(() => {
    if (!comparedOnce) return;
    if (!playerOne || !selectedPlayer) return;
    // ensure it's the same pair
    if (String(lastComparedPair.one) !== String(playerOne.player_id) || String(lastComparedPair.two) !== String(selectedPlayer.player_id)) return;

    const weekOverride = viewMode === 'week' ? selectedWeek : undefined;

    (async () => {
      setComparing(true);
      setPlayerOneStats(null);
      setPlayerTwoStats(null);
      try {
        if (typeof weekOverride === 'number') {
          await Promise.all([loadStats(playerOne, true, statScope, weekOverride), loadStats(selectedPlayer, false, statScope, weekOverride)]);
        } else {
          await Promise.all([loadStats(playerOne, true, statScope), loadStats(selectedPlayer, false, statScope)]);
        }
      } catch (err) {
        console.warn('Auto-reload after compare failed', err);
      } finally {
        setComparing(false);
      }
    })();
  }, [comparedOnce, statScope, selectedWeek, viewMode, playerOne, selectedPlayer, lastComparedPair]);

  // Reset comparedOnce when either player changes to a different player
  useEffect(() => {
    if (!lastComparedPair.one || !lastComparedPair.two) return;
    if (!playerOne || !selectedPlayer) {
      setComparedOnce(false);
      return;
    }
    if (String(lastComparedPair.one) !== String(playerOne.player_id) || String(lastComparedPair.two) !== String(selectedPlayer.player_id)) {
      setComparedOnce(false);
      setLastComparedPair({});
      setPlayerOneStats(null);
      setPlayerTwoStats(null);
    }
  }, [playerOne, selectedPlayer]);

  

  // Clear preloaded stats when scope changes so we don't show wrong-scope data
  useEffect(() => {
    setPlayerOneStats(null);
    setPlayerTwoStats(null);
  }, [statScope]);

  const filteredPlayers = useMemo(() => {
    if (!search.length) return [];
    const referencePlayer = playerOne || selectedPlayer || player;
    const group = getPositionGroup(referencePlayer?.position || referencePlayer?.position);
    const applyGroupFilter = Boolean(group && group !== 'OTHER');

        return allPlayers
      .filter((p: any) => {
        // don't show players already selected in either slot
        if (playerOne && String(p.player_id) === String(playerOne.player_id)) return false;
        if (selectedPlayer && String(p.player_id) === String(selectedPlayer.player_id)) return false;
        if (!p.full_name) return false;
        const matchesQuery = p.full_name.toLowerCase().includes(search.toLowerCase());
        if (!matchesQuery) return false;
        if (!applyGroupFilter) return true; // no position-group restriction
        // Use canCompare to allow compatible groups (e.g. DL <-> LB)
        return canCompare(referencePlayer?.position, p.position);
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
    // If value is precise to a single tenth (e.g. x.5), show one decimal
    const tenth = Math.round(n * 10) / 10;
    if (Math.abs(n - tenth) < 1e-9) return tenth.toFixed(1);
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function statRows(position: string) {
    switch (position) {
      case "QB":
        return [
          ["Passing Yards", "passing_yards"],
          ["Passing TD", "passing_tds"],
          ["Interceptions", "passing_interceptions", true],
          ["Completion %", "completion_pct"],
          ["Completions", "completions"],
          ["Attempts", "attempts"],
          ["Rush Yards", "rushing_yards"],
          ["Rush TD", "rushing_tds"],
        ];

      case "RB":
        return [
          ["Carries", "carries"],
          ["Rush Yards", "rushing_yards"],
          ["Rush TD", "rushing_tds"],
          ["Receptions", "receptions"],
          ["Receiving Yards", "receiving_yards"],
          ["Receiving TD", "receiving_tds"],
        ];

      case "WR":
      case "TE":
        return [
          ["Targets", "targets"],
          ["Receptions", "receptions"],
          ["Receiving Yards", "receiving_yards"],
          ["Receiving TD", "receiving_tds"],
        ];

      case "K":
        return [
          ["FG Made", "fg_made"],
          ["FG Attempted", "fg_att"],
          ["XP Made", "pat_made"],
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

        // omit fantasy points row to avoid duplicate final row

        return rows;
    }
  }
  // header rows depend on whether we're viewing a single week or a season
  // Note: remove the top-level Fantasy Points row so it doesn't appear above the
  // main stats list. Fantasy points will be shown in the stats area as requested.
  const headerRows = viewMode === 'week'
    ? [['Played', 'played'], ['Injury Status', 'injury_status'], ['Fantasy Points', 'fantasy_points_ppr']]
    : [['Games', 'games'], ['Fantasy Points', 'fantasy_points_ppr']];

  // When both compared players are individual defensive positions, omit fantasy points
  const bothDefensive = isIndividualDefensivePosition((playerOne || {}).position) && isIndividualDefensivePosition((selectedPlayer || {}).position);
  const headerRowsFiltered = (headerRows as any).filter((r: any) => {
    if (bothDefensive && String(r[1]) === 'fantasy_points_ppr') return false;
    return true;
  });

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

        <Text style={styles.hint}>
          Select a box to add or change a player
        </Text>

      </View>

      {/* Player Cards */}

      <View style={styles.playerRow}>

        <TouchableOpacity
          style={styles.playerCard}
          activeOpacity={0.8}
          onPress={() => {
            setActiveSlot('one');
          }}
        >
          {playerOne ? (
            <>
              <Image
                source={{ uri: getHeadshot(playerOne) }}
                style={styles.headshot}
              />

              <Text style={styles.playerName}>{playerOne.full_name}</Text>

              <Text style={styles.playerInfo}>{playerOne.position} • {playerOne.team}</Text>

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => {
                  setPlayerOne(null);
                  setPlayerOneStats(null);
                  // if removing the currently active slot, clear it
                  if (activeSlot === 'one') setActiveSlot(null);
                }}
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyCircleText}>?</Text>
              </View>

              <Text style={styles.playerName}>Select Player</Text>

              <Text style={styles.playerInfo}>Tap to search</Text>
            </>
          )}

        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playerCard}
          activeOpacity={0.8}
          onPress={() => {
            setActiveSlot('two');
          }}
        >
          {selectedPlayer ? (
            <>
              <Image
                source={{ uri: getHeadshot(selectedPlayer) }}
                style={styles.headshot}
              />

              <Text style={styles.playerName}>{selectedPlayer.full_name}</Text>

              <Text style={styles.playerInfo}>{selectedPlayer.position} • {selectedPlayer.team}</Text>

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => {
                  setSelectedPlayer(null);
                  setPlayerTwoStats(null);
                  if (activeSlot === 'two') setActiveSlot(null);
                }}
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyCircleText}>?</Text>
              </View>

              <Text style={styles.playerName}>Select Player</Text>

              <Text style={styles.playerInfo}>Tap to search</Text>
            </>
          )}

        </TouchableOpacity>

      </View>

      {/* Compare button below player boxes */}
      <View style={{ paddingHorizontal: 20, marginTop: 12, alignItems: 'center' }}>
        <TouchableOpacity
          style={[styles.toggleButton, { paddingHorizontal: 28, backgroundColor: '#4f46e5' }]}
          onPress={async () => {
            if (!playerOne || !selectedPlayer) {
              Alert.alert('Select players', 'Please select two players to compare.');
              return;
            }
            // Ensure positions are comparable
            if (!canCompare(playerOne.position, selectedPlayer.position)) {
              Alert.alert('Cannot compare', 'Players must be of the same position group (e.g. QB, RB, WR/TE, DL, LB, DB).');
              return;
            }

            setComparing(true);
            setPlayerOneStats(null);
            setPlayerTwoStats(null);

              try {
              const weekOverride = viewMode === 'week' ? selectedWeek : undefined;
              if (typeof weekOverride === 'number') {
                await Promise.all([loadStats(playerOne, true, statScope, weekOverride), loadStats(selectedPlayer, false, statScope, weekOverride)]);
              } else {
                await Promise.all([loadStats(playerOne, true, statScope), loadStats(selectedPlayer, false, statScope)]);
              }
              setComparedOnce(true);
              setLastComparedPair({ one: playerOne.player_id, two: selectedPlayer.player_id });
            } catch (err) {
              console.warn('Compare failed', err);
            } finally {
              setComparing(false);
            }
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Compare</Text>
        </TouchableOpacity>
      </View>

      {/* Stat scope selector + Week toggle */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10 }}>
        <TouchableOpacity
          style={[styles.toggleButton, statScope === 'regular' && viewMode !== 'week' && styles.toggleActive]}
          onPress={() => { setStatScope('regular'); setViewMode('season'); }}
        >
          <Text style={[styles.toggleText, statScope === 'regular' && viewMode !== 'week' && styles.toggleTextActive]}>Regular Season</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleButton, statScope === 'post' && viewMode !== 'week' && styles.toggleActive]}
          onPress={() => { setStatScope('post'); setViewMode('season'); }}
        >
          <Text style={[styles.toggleText, statScope === 'post' && viewMode !== 'week' && styles.toggleTextActive]}>Post Season</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleButton, statScope === 'all' && viewMode !== 'week' && styles.toggleActive]}
          onPress={() => { setStatScope('all'); setViewMode('season'); }}
        >
          <Text style={[styles.toggleText, statScope === 'all' && viewMode !== 'week' && styles.toggleTextActive]}>Whole Season</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'week' && styles.toggleActive]}
          onPress={() => { setViewMode('week'); }}
        >
          <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>By Week</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}

      <View style={styles.searchSection}>
        {activeSlot !== null && (
          <>
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
                keyExtractor={(item: any) => String(item.player_id)}
                keyboardShouldPersistTaps="handled"
                style={styles.searchResults}
                renderItem={({ item }: any) => {
                  const referencePlayer = playerOne || selectedPlayer || player;
                  const group = getPositionGroup(referencePlayer?.position || referencePlayer?.position);
                  const applyGroupFilter = Boolean(group && group !== 'OTHER');
                  const allowed = !applyGroupFilter || canCompare(referencePlayer?.position, item.position);

                  return (
                      <TouchableOpacity
                      style={[styles.searchRow, !allowed && { opacity: 0.5 }]}
                      onPress={() => {
                        if (!allowed) {
                          Alert.alert("Cannot compare", "You can only compare players of the same position group.");
                          return;
                        }

                        // Determine target slot
                        const targetSlot = activeSlot ? activeSlot : (!playerOne ? 'one' : 'two');

                        // If assigning to an empty slot while the other slot already has a player,
                        // ensure the groups match.
                        if (targetSlot === 'one' && selectedPlayer) {
                          if (!canCompare(item.position, selectedPlayer.position)) {
                            Alert.alert('Cannot compare', 'Players must be of the same position group.');
                            return;
                          }
                        }

                        if (targetSlot === 'two' && playerOne) {
                          if (!canCompare(playerOne.position, item.position)) {
                            Alert.alert('Cannot compare', 'Players must be of the same position group.');
                            return;
                          }
                        }

                        if (targetSlot === 'one') setPlayerOne(item);
                        else setSelectedPlayer(item);

                        setSearch("");
                        setActiveSlot(null);
                      }}
                    >
                      <Image source={{ uri: getHeadshot(item) }} style={styles.searchHeadshot} />

                      <View>
                        <Text style={styles.searchName}>{item.full_name}</Text>
                        <Text style={styles.searchTeam}>{item.position} • {item.team}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </>
        )}
      </View>

      

      {viewMode === "week" && (

        <ScrollView

          horizontal

          showsHorizontalScrollIndicator={false}

          style={styles.weekSelector}

        >

          {Array.from({ length: 22 }, (_, i) => i + 1).map((week) => (

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
              {([].concat(headerRowsFiltered as any).concat(statRows((playerOne || player || {}).position || '') as any)).map((row) => {
                const [label, key, lowerIsBetter] = row as any;
                const oneVal = Number(playerOneStats[key] || 0);
                const twoVal = Number(playerTwoStats[key] || 0);
                // Disable comparison coloring only for injury status rows
                const neutralColors: [string, string] = ["#ececec", "#ececec"];
                let [leftColor, rightColor] = (key === 'injury_status')
                  ? neutralColors
                  : compareColor(oneVal, twoVal, !!lowerIsBetter);
                // compute completion percentage when needed
                const oneComp = Number(playerOneStats.completions || 0);
                const oneAtt = Number(playerOneStats.attempts || 0);
                const onePct = oneAtt > 0 ? (oneComp / oneAtt) * 100 : 0;
                const twoComp = Number(playerTwoStats.completions || 0);
                const twoAtt = Number(playerTwoStats.attempts || 0);
                const twoPct = twoAtt > 0 ? (twoComp / twoAtt) * 100 : 0;
                // For completion percentage, re-evaluate colors based on pct
                if (key === 'completion_pct') {
                  const colors = compareColor(Math.round(onePct * 10) / 10, Math.round(twoPct * 10) / 10, false);
                  leftColor = colors[0];
                  rightColor = colors[1];
                }
                return (
                  <View key={key} style={styles.statCard}>
                    <Text style={styles.statTitle}>{label}</Text>
                    <View style={styles.compareRow}>
                      <View style={[styles.valueBox, { backgroundColor: leftColor }]}> 
                        {key === 'injury_status' ? (
                          <Text style={styles.valueText}>{(String(playerOneStats[key]) || '').toLowerCase().trim() === 'played' ? 'No Injury' : (String(playerOneStats[key]) ? String(playerOneStats[key]) : 'Not Injured')}</Text>
                        ) : key === 'played' ? (
                          <Text style={styles.valueText}>{playerOneStats.played ? 'Yes' : 'No'}</Text>
                        ) : key === 'completion_pct' ? (
                          <Text style={styles.valueText}>{(Math.round(onePct * 10) / 10).toFixed(1)}%</Text>
                        ) : (
                          <Text style={styles.valueText}>{formatNumber(oneVal)}</Text>
                        )}
                      </View>
                      
                      <View style={[styles.valueBox, { backgroundColor: rightColor }]}> 
                        {key === 'injury_status' ? (
                          <Text style={styles.valueText}>{(String(playerTwoStats[key]) || '').toLowerCase().trim() === 'played' ? 'No Injury' : (String(playerTwoStats[key]) ? String(playerTwoStats[key]) : 'Not Injured')}</Text>
                        ) : key === 'played' ? (
                          <Text style={styles.valueText}>{playerTwoStats.played ? 'Yes' : 'No'}</Text>
                        ) : key === 'completion_pct' ? (
                          <Text style={styles.valueText}>{(Math.round(twoPct * 10) / 10).toFixed(1)}%</Text>
                        ) : (
                          <Text style={styles.valueText}>{formatNumber(twoVal)}</Text>
                        )}
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

  hint: {
    marginTop: 8,
    fontSize: 13,
    color: '#6b7280',
  },

  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  removeText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
  },

});