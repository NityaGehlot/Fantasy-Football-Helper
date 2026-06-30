// screens/PlayerDetailsScreen.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { getPlayerStatsByWeek } from '../services/nflApi';
import { getPlayersFromGithub } from '../services/sleeperAPI';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../AppNavigator';

type NewsArticle = {
  title: string;
  summary?: string;
  link?: string;
  published?: string;
  player?: string;
  impact?: string;
};

export default function PlayerDetailsScreen({ route }: any) {
  type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
  const navigation = useNavigation<NavigationProp>();
  const { player, stats, week, fantasyPoints } = route.params;
  const displayTeam = String(stats?.team || player?.team || 'N/A');

  const [allWeeksStats, setAllWeeksStats] = useState<any>({});
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(true);
  const [loadingNews, setLoadingNews] = useState(true);
  const [newsTab, setNewsTab] = useState<'player' | 'team'>('player');
  const [seasonScope, setSeasonScope] = useState<'whole' | 'regular' | 'post'>('regular');
  const [seasonViewMode, setSeasonViewMode] = useState<'totals' | 'averages'>('totals');
  const [teamPlayedPostseasonByWeek, setTeamPlayedPostseasonByWeek] = useState<Record<number, boolean>>({});
  const [playerNews, setPlayerNews] = useState<NewsArticle[]>([]);
  const [teamNews, setTeamNews] = useState<NewsArticle[]>([]);

  const NEWS_BASE_URL = "https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/news";

  const normalizeName = (value?: string) => String(value || "").trim().toLowerCase();
  const normalizeTeam = (value?: string) => {
    const team = String(value || '').toUpperCase().trim();
    const aliases: Record<string, string> = {
      WSH: 'WAS',
      JAC: 'JAX',
      LA: 'LAR',
    };
    return aliases[team] || team;
  };

  const getNewsFileKey = (position?: string) => {
    const pos = String(position || '').toUpperCase().trim();
    if (pos === 'QB') return 'qb';
    if (pos === 'RB') return 'rb';
    if (pos === 'WR') return 'wr';
    if (pos === 'TE') return 'te';
    if (pos === 'K') return 'k';
    if (pos === 'CB') return 'cb';
    if (pos === 'DB') return 'db';
    if (pos === 'DL') return 'dl';
    if (pos === 'LB') return 'lb';
    if (pos === 'DE') return 'dl';
    if (pos === 'DT') return 'dl';
    if (pos === 'SS') return 'db';
    if (pos === 'FS') return 'db';
    return null;
  };

  const hasMeaningfulStats = (weekStats: any) => {
    if (!weekStats || typeof weekStats !== 'object') return false;

    const nonStatKeys = new Set([
      'player_id',
      'player_name',
      'team',
      'position',
      'opponent',
      'opp_team',
      'week',
      'season',
      'game_id',
      'headshot_url',
      'injury_status',
      'practice_status',
      'practice_primary_injury',
      'primary_injury',
      'secondary_injury',
      'status',
      'number',
      'age',
      'years_exp',
      'college',
      'height',
      'weight',
      'opponent_team', // defensive stats field
    ]);

    for (const [key, rawValue] of Object.entries(weekStats)) {
      if (nonStatKeys.has(key)) continue;

      const value = Number(rawValue);
      if (!Number.isNaN(value) && value !== 0) {
        return true;
      }
    }

    return false;
  };

  const hasInjuryInfo = (weekStats: any) => {
    if (!weekStats || typeof weekStats !== 'object') return false;

    const status = String(weekStats?.injury_status ?? '').toUpperCase().trim();
    const primary = String(weekStats?.primary_injury ?? '').trim();
    const secondary = String(weekStats?.secondary_injury ?? '').trim();
    const practicePrimary = String(weekStats?.practice_primary_injury ?? '').trim();
    const practiceSecondary = String(weekStats?.practice_secondary_injury ?? '').trim();

    return !!(
      primary ||
      secondary ||
      practicePrimary ||
      practiceSecondary ||
      ['OUT', 'IR', 'IR-R', 'INJURED RESERVE', 'QUESTIONABLE', 'DOUBTFUL'].includes(status)
    );
  };

  const seasonAvgFantasyPoints = useMemo(() => {
    const values = Object.values(allWeeksStats)
      .map((w: any) => Number(w?.fantasy_points_ppr))
      .filter((v) => Number.isFinite(v));

    if (values.length === 0) return null;
    const total = values.reduce((acc, v) => acc + v, 0);
    return total / values.length;
  }, [allWeeksStats]);

  const getWeekCardBackground = (weekStats: any) => {
    const defaultColor = '#f9f9f9';
    if (isIndividualDefensivePosition(player?.position)) return defaultColor;
    if (!weekStats || seasonAvgFantasyPoints === null) return defaultColor;

    const weekFantasyPoints = Number(weekStats?.fantasy_points_ppr);
    if (!Number.isFinite(weekFantasyPoints)) return defaultColor;

    // "Around average" uses a tolerance band to avoid tiny differences flipping colors.
    const tolerance = Math.max(1, seasonAvgFantasyPoints * 0.1);
    if (Math.abs(weekFantasyPoints - seasonAvgFantasyPoints) <= tolerance) return '#fff9db'; // light yellow
    if (weekFantasyPoints > seasonAvgFantasyPoints + tolerance) return '#e8f7ee'; // light green
    return '#fdecec'; // light red
  };

  const getWeekLabel = (weekNumber: number) => {
    if (weekNumber === 19) return 'Wild Card Round';
    if (weekNumber === 20) return 'Divisional Round';
    if (weekNumber === 21) return 'Conference Championship';
    if (weekNumber === 22) return 'Super Bowl';
    return `Week ${weekNumber}`;
  };

  useEffect(() => {
    const fetchAllWeeks = async () => {
      setLoadingPlayerStats(true);
      try {
        const weeks = Array.from({ length: 22 }, (_, i) => i + 1);
        const promises = weeks.map(w => getPlayerStatsByWeek(w));
        const results = await Promise.all(promises);

        const statsMap: any = {};
        const postseasonPlayed: Record<number, boolean> = {};
        const playerTeam = normalizeTeam(player?.team || stats?.team || '');

        results.forEach((data, index) => {
          const w = index + 1;
          const playerStats = getPlayerNFLStats(player.player_id, w, data);
          if (playerStats && (hasMeaningfulStats(playerStats) || hasInjuryInfo(playerStats))) {
            statsMap[w] = playerStats;
          }

          if (w >= 19 && w <= 22) {
            const rows = Array.isArray(data) ? data : (Object.values(data ?? {}).flat() as any[]);
            postseasonPlayed[w] = rows.some((row: any) => normalizeTeam(row?.team) === playerTeam);
          }
        });
        setAllWeeksStats(statsMap);
        setTeamPlayedPostseasonByWeek(postseasonPlayed);
      } catch (err) {
        console.error('Error fetching player stats:', err);
      } finally {
        setLoadingPlayerStats(false);
      }
    };
    fetchAllWeeks();
  }, [player]);

  useEffect(() => {
    const loadNews = async () => {
      setLoadingNews(true);
      try {
        const fileKey = getNewsFileKey(player?.position);
        if (!fileKey) {
          setPlayerNews([]);
          setTeamNews([]);
          return;
        }

        const newsResponse = await fetch(`${NEWS_BASE_URL}/news_${fileKey}.json`);
        if (!newsResponse.ok) {
          throw new Error(`Failed to load news_${fileKey}.json`);
        }

        const rawNews = await newsResponse.json();
        const newsList: NewsArticle[] = Array.isArray(rawNews) ? rawNews : [];

        const currentPlayerName = normalizeName(player?.full_name);
        const currentTeam = String(player?.team || stats?.team || '').trim();

        const onlyPlayerNews = newsList.filter((article) =>
          normalizeName(article.player) === currentPlayerName
        );

        let onlyTeamNews: NewsArticle[] = [];

        if (currentTeam) {
          const sleeperPlayers = await getPlayersFromGithub();
          const teamNames = new Set<string>(
            Object.values(sleeperPlayers || {})
              .filter((p: any) => p?.team === currentTeam && p?.full_name)
              .map((p: any) => normalizeName(p.full_name))
          );

          // Team news should exclude the current player and focus on teammates.
          teamNames.delete(currentPlayerName);

          onlyTeamNews = newsList.filter((article) =>
            teamNames.has(normalizeName(article.player))
          );
        }

        setPlayerNews(onlyPlayerNews.slice(0, 2));
        setTeamNews(onlyTeamNews.slice(0, 2));
      } catch (err) {
        console.error('Error loading player/team news:', err);
        setPlayerNews([]);
        setTeamNews([]);
      } finally {
        setLoadingNews(false);
      }
    };

    loadNews();
  }, [player?.full_name, player?.position, player?.team, stats?.team]);

  const openArticle = async (url?: string) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (err) {
      console.error('Failed to open article URL:', err);
    }
  };

  const getImpactBadgeMeta = (impact?: string) => {
    const raw = String(impact || '').trim().toLowerCase();

    if (!raw) {
      return {
        label: 'General',
        backgroundColor: '#eef2f7',
        borderColor: '#d9e2ec',
        textColor: '#475569',
      };
    }

    if (raw === 'positive') {
      return {
        label: 'Positive',
        backgroundColor: '#e8f7ee',
        borderColor: '#b9e6c8',
        textColor: '#1f7a3d',
      };
    }

    if (raw === 'negative') {
      return {
        label: 'Negative',
        backgroundColor: '#fdecec',
        borderColor: '#f5c2c2',
        textColor: '#b42318',
      };
    }

    if (raw === 'neutral') {
      return {
        label: 'Neutral',
        backgroundColor: '#f2f4f7',
        borderColor: '#dde3ea',
        textColor: '#5f6b7a',
      };
    }

    if (raw === 'roster_move' || raw === 'roster move' || raw === 'transaction') {
      return {
        label: 'Roster Move',
        backgroundColor: '#eaf1ff',
        borderColor: '#c7d9ff',
        textColor: '#2f5bb7',
      };
    }

    const titleCase = raw
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    return {
      label: titleCase || 'General',
      backgroundColor: '#eef2f7',
      borderColor: '#d9e2ec',
      textColor: '#475569',
    };
  };

  const renderNewsCards = (articles: NewsArticle[]) => {
    if (loadingNews) {
      return <Text style={styles.statLine}>Loading news...</Text>;
    }

    if (newsTab === 'player' && articles.length === 0) {
      return (
        <Text style={styles.statLine}>
          No player news found right now. Try checking out the Team News tab.
        </Text>
      );
    }

    if (articles.length === 0) {
      return <Text style={styles.statLine}>No team news found right now.</Text>;
    }

    return (
      <View>
        {articles.map((article, index) => (
          (() => {
            const impactMeta = getImpactBadgeMeta(article.impact);
            return (
          <TouchableOpacity
            key={`${article.link || article.title}-${index}`}
            style={styles.newsCard}
            onPress={() => openArticle(article.link)}
            activeOpacity={0.85}
          >
            <Text style={styles.newsTitle}>{article.title || 'Untitled article'}</Text>
            {!!article.summary && (
              <Text numberOfLines={2} style={styles.newsSummary}>{article.summary}</Text>
            )}
            <View style={styles.newsMetaRow}>
              <Text style={styles.newsMetaText}>{article.published || 'Unknown date'}</Text>
              <View
                style={[
                  styles.impactBadge,
                  {
                    backgroundColor: impactMeta.backgroundColor,
                    borderColor: impactMeta.borderColor,
                  },
                ]}
              >
                <Text style={[styles.impactBadgeText, { color: impactMeta.textColor }]}>
                  {impactMeta.label}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
            );
          })()
        ))}
      </View>
    );
  };

  const getPlayerNFLStats = (playerId: string | number, week: number, playerStatsData: any[]) => {
    if (!playerStatsData) return null;

    const sleeperPlayer = player; // assuming player has the necessary fields

    const weekMatches = playerStatsData.filter(
      (p: any) => Number(String(p.week).trim()) === Number(week)
    );

    // DEFENSE MATCH
    if (sleeperPlayer.position === "DEF") {
      const defId = `DEF_${sleeperPlayer.team}`;
      return weekMatches.find((p: any) => String(p.player_id) === defId) || null;
    }

    // PLAYER ID MATCH FIRST (for defensive individual players with matching IDs)
    const idMatch = weekMatches.find(
      (p: any) => String(p.player_id) === String(playerId)
    );
    if (idMatch) return idMatch;

    // FALLBACK: NAME MATCH with normalization
    const fullName = sleeperPlayer.full_name?.toLowerCase().trim();
    if (!fullName) return null;
    const sleeperPosition = String(sleeperPlayer.position || "").toUpperCase().trim();
    const sleeperTeam = String(sleeperPlayer.team || "").toUpperCase().trim();

    // Normalize names for comparison (remove extra spaces, punctuation)
    const normalizeName = (name: string) => {
      return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, ' ') // remove punctuation/symbols
        .replace(/\s+/g, ' '); // normalize spaces
    };

    const normalizedFullName = normalizeName(fullName);

    const isDefensiveIndividual = [
      "DL", "DE", "DT", "EDGE", "LB", "ILB", "OLB", "CB", "S", "SS", "FS", "DB"
    ].includes(sleeperPosition);

    const byName = (p: any) => normalizeName(p?.player_name) === normalizedFullName;
    const byPartialName = (p: any) => {
      const jsonName = normalizeName(p?.player_name);
      if (!jsonName) return false;
      return jsonName.includes(normalizedFullName) || normalizedFullName.includes(jsonName);
    };
    const byTeam = (p: any) => {
      if (!sleeperTeam) return true;
      return String(p?.team || "").toUpperCase().trim() === sleeperTeam;
    };

    // For individual defensive players, ignore position and match by name + team.
    if (isDefensiveIndividual) {
      const defenseExact = weekMatches.find((p: any) => byName(p) && byTeam(p));
      if (defenseExact) return defenseExact;

      const defensePartial = weekMatches.find((p: any) => byPartialName(p) && byTeam(p));
      if (defensePartial) return defensePartial;

      // Last resort when upstream team is missing/null in source rows.
      const defenseNameOnly = weekMatches.find((p: any) => byName(p) || byPartialName(p));
      if (defenseNameOnly) return defenseNameOnly;
    }

    // Offensive / non-defensive-individual fallback sequence:
    // 1) exact name + team, 2) exact name + position, 3) exact name,
    // 4) partial name + team, 5) partial name + position.
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

  const getTeamLogo = (teamAbbrev: string) => {
    if (!teamAbbrev)
      return "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg";

    return `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${teamAbbrev.trim()}`;
  };

  const getPositionColor = (pos: string) => {
    const position = String(pos || '').toUpperCase().trim();
    switch (position) {
      case "QB": return "#ff6b6b";
      case "RB": return "#2ec4b6";
      case "WR": return "#48b0f7";
      case "TE": return "#ffbe0b";
      case "K": return "#9d4edd";
      case "DEF": return "#777";
      case "DL": return "#777";
      case "DE": return "#777";
      case "DT": return "#777";
      case "EDGE": return "#777";
      case "LB": return "#666";
      case "ILB": return "#666";
      case "OLB": return "#666";
      case "CB": return "#555";
      case "DB": return "#555";
      case "S": return "#444";
      case "SS": return "#444";
      case "FS": return "#444";
      default: return "#aaa";
    }
  };

  const isIndividualDefensivePosition = (position: string) => {
    const pos = String(position || '').toUpperCase().trim();
    return ["DL", "DE", "DT", "EDGE", "LB", "ILB", "OLB", "CB", "DB", "S", "SS", "FS"].includes(pos);
  };

  // =========================
  // SAME STAT FORMATTER
  // =========================
  const formatPlayerStats = (position: string, stats: any) => {
    if (!stats) return [];

    const lines: string[] = [];
    const pos = String(position).trim().toUpperCase();

    // QB
    if (pos === "QB") {
      const passing: string[] = [];

      if (stats.completions > 0 || stats.attempts > 0)
        passing.push(`${stats.completions}/${stats.attempts} CMP`);

      if (stats.passing_yards > 0)
        passing.push(`${stats.passing_yards} YD`);

      if (stats.passing_tds > 0)
        passing.push(`${stats.passing_tds} TD`);

      if (stats.passing_interceptions > 0)
        passing.push(`${stats.passing_interceptions} INT`);

      if (passing.length) lines.push(passing.join(", "));

      const rushing: string[] = [];

      if (stats.carries > 0)
        rushing.push(`${stats.carries} CAR`);

      if (stats.rushing_yards > 0)
        rushing.push(`${stats.rushing_yards} YD`);

      if (stats.rushing_tds > 0)
        rushing.push(`${stats.rushing_tds} TD`);

      if (rushing.length) lines.push(rushing.join(", "));
    }

    // RB
    if (pos === "RB") {
      const rushing: string[] = [];

      if (stats.carries > 0)
        rushing.push(`${stats.carries} CAR`);

      if (stats.rushing_yards > 0)
        rushing.push(`${stats.rushing_yards} YD`);

      if (stats.rushing_tds > 0)
        rushing.push(`${stats.rushing_tds} TD`);

      if (rushing.length) lines.push(rushing.join(", "));

      const receiving: string[] = [];

      if (stats.receptions > 0 || stats.targets > 0)
        receiving.push(`${stats.receptions}/${stats.targets} REC`);

      if (stats.receiving_yards > 0)
        receiving.push(`${stats.receiving_yards} YD`);

      if (stats.receiving_tds > 0)
        receiving.push(`${stats.receiving_tds} TD`);

      if (receiving.length) lines.push(receiving.join(", "));
    }

    // WR / TE
    if (pos === "WR" || pos === "TE") {
      const receiving: string[] = [];

      if (stats.receptions > 0 || stats.targets > 0)
        receiving.push(`${stats.receptions}/${stats.targets} REC`);

      if (stats.receiving_yards > 0)
        receiving.push(`${stats.receiving_yards} YD`);

      if (stats.receiving_tds > 0)
        receiving.push(`${stats.receiving_tds} TD`);

      if (receiving.length) lines.push(receiving.join(", "));
    }

    // DL, LB, CB, S (Defensive positions)
    if (isIndividualDefensivePosition(pos)) {
      const defense: string[] = [];

      if (stats.def_tackles_solo > 0)
        defense.push(`${stats.def_tackles_solo} TKL`);

      if (stats.def_tackles_with_assist > 0)
        defense.push(`${stats.def_tackles_with_assist} AST`);

      if (stats.def_sacks > 0)
        defense.push(`${stats.def_sacks} SK`);

      if (stats.def_interceptions > 0)
        defense.push(`${stats.def_interceptions} INT`);

      if (stats.def_pass_defended > 0)
        defense.push(`${stats.def_pass_defended} PD`);

      if (stats.def_fumbles_forced > 0)
        defense.push(`${stats.def_fumbles_forced} FF`);

      if (stats.def_tds > 0)
        defense.push(`${stats.def_tds} TD`);

      if (defense.length) lines.push(defense.join(", "));
    }

    return lines;
  };

  // =========================
  // SEASON TOTALS
  // =========================
  const computeSeasonStats = () => {
    const weekNumbers = Object.keys(allWeeksStats)
      .map((w) => Number(w))
      .filter((w) => Number.isFinite(w));

    const filteredWeekNumbers = weekNumbers.filter((w) => {
      if (seasonScope === 'regular') return w >= 1 && w <= 18;
      if (seasonScope === 'post') return w >= 19 && w <= 22;
      return true;
    });

    const weeks = filteredWeekNumbers
      .sort((a, b) => a - b)
      .map((w) => allWeeksStats[w]);

    if (weeks.length === 0) return null;

    const pos = String(player.position).trim().toUpperCase();
    const sum = (key: string) => weeks.reduce((acc: number, w: any) => acc + (Number(w[key]) || 0), 0);

    if (pos === 'QB') {
      return {
        completions: sum('completions'),
        attempts: sum('attempts'),
        passing_yards: sum('passing_yards'),
        passing_tds: sum('passing_tds'),
        passing_interceptions: sum('passing_interceptions'),
        carries: sum('carries'),
        rushing_yards: sum('rushing_yards'),
        rushing_tds: sum('rushing_tds'),
        fantasy_points_ppr: sum('fantasy_points_ppr'),
        games: weeks.length,
      };
    }
    if (pos === 'RB') {
      return {
        carries: sum('carries'),
        rushing_yards: sum('rushing_yards'),
        rushing_tds: sum('rushing_tds'),
        receptions: sum('receptions'),
        targets: sum('targets'),
        receiving_yards: sum('receiving_yards'),
        receiving_tds: sum('receiving_tds'),
        fantasy_points_ppr: sum('fantasy_points_ppr'),
        games: weeks.length,
      };
    }
    if (pos === 'WR' || pos === 'TE') {
      return {
        receptions: sum('receptions'),
        targets: sum('targets'),
        receiving_yards: sum('receiving_yards'),
        receiving_tds: sum('receiving_tds'),
        carries: sum('carries'),
        rushing_yards: sum('rushing_yards'),
        rushing_tds: sum('rushing_tds'),
        fantasy_points_ppr: sum('fantasy_points_ppr'),
        games: weeks.length,
      };
    }
    if (pos === 'K') {
      return {
        fg_att: sum('fg_att'),
        fg_made: sum('fg_made_0_19') + sum('fg_made_20_29') + sum('fg_made_30_39') + sum('fg_made_40_49') + sum('fg_made_50_59') + sum('fg_made_60_'),
        pat_made: sum('pat_made'),
        pat_att: sum('pat_att'),
        fantasy_points_ppr: sum('fantasy_points_ppr'),
        games: weeks.length,
      };
    }
    if (pos === 'DEF') {
      return {
        def_sacks: sum('def_sacks'),
        def_interceptions: sum('def_interceptions'),
        def_fumbles_forced: sum('def_fumbles_forced'),
        fumbles_recovered: sum('fumbles_recovered'),
        def_tds: sum('def_tds') + sum('special_teams_tds'),
        def_safeties: sum('def_safeties'),
        points_allowed: sum('points_allowed'),
        fantasy_points_ppr: sum('fantasy_points_ppr'),
        games: weeks.length,
      };
    }
    if (isIndividualDefensivePosition(pos)) {
      return {
        def_tackles_solo: sum('def_tackles_solo'),
        def_tackles_with_assist: sum('def_tackles_with_assist'),
        def_tackles_for_loss: sum('def_tackles_for_loss'),
        def_sacks: sum('def_sacks'),
        def_interceptions: sum('def_interceptions'),
        def_pass_defended: sum('def_pass_defended'),
        def_fumbles_forced: sum('def_fumbles_forced'),
        def_tds: sum('def_tds'),
        def_qb_hits: sum('def_qb_hits'),
        fantasy_points_ppr: sum('fantasy_points_ppr'),
        games: weeks.length,
      };
    }
    return null;
  };

  const renderSeasonStats = () => {
    const pos = String(player.position).trim().toUpperCase();
    const s = computeSeasonStats();
    const games = Number(s?.games) || 0;
    const isIndividualDefensiveSeasonView = isIndividualDefensivePosition(pos);

    const toDisplayNumber = (value: number) => {
      const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
      if (Number.isInteger(rounded)) return String(rounded);
      return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    };

    const formatStat = (value: number | undefined) => {
      const numeric = Number(value) || 0;
      if (seasonViewMode === 'totals') return toDisplayNumber(numeric);
      if (!games) return '0';
      return toDisplayNumber(numeric / games);
    };

    const formatPair = (left: number | undefined, right: number | undefined) => {
      const l = Number(left) || 0;
      const r = Number(right) || 0;
      if (seasonViewMode === 'totals') return `${toDisplayNumber(l)}/${toDisplayNumber(r)}`;
      if (!games) return '0/0';
      return `${toDisplayNumber(l / games)}/${toDisplayNumber(r / games)}`;
    };

    const rows: { label: string; value: string }[] = [];

    if (s) {
      rows.push({ label: 'Games', value: String(s.games) });
      if (!isIndividualDefensiveSeasonView) {
        rows.push({
          label: seasonViewMode === 'totals' ? 'Fantasy Pts' : 'Fantasy Pts/G',
          value: seasonViewMode === 'totals'
            ? toDisplayNumber(Number(s.fantasy_points_ppr) || 0)
            : formatStat(Number(s.fantasy_points_ppr) || 0),
        });
      }

      if (pos === 'QB') {
        rows.push({ label: seasonViewMode === 'totals' ? 'Completions' : 'Comp/Att (Avg)', value: formatPair(s.completions, s.attempts) });
        rows.push({ label: 'Pass Yards', value: formatStat(s.passing_yards) });
        rows.push({ label: 'Pass TDs', value: formatStat(s.passing_tds) });
        rows.push({ label: 'INTs', value: formatStat(s.passing_interceptions) });
        if ((s.carries ?? 0) > 0) {
          rows.push({ label: 'Carries', value: formatStat(s.carries) });
          rows.push({ label: 'Rush Yards', value: formatStat(s.rushing_yards) });
          rows.push({ label: 'Rush TDs', value: formatStat(s.rushing_tds) });
        }
      } else if (pos === 'RB') {
        rows.push({ label: 'Carries', value: formatStat(s.carries) });
        rows.push({ label: 'Rush Yards', value: formatStat(s.rushing_yards) });
        rows.push({ label: 'Rush TDs', value: formatStat(s.rushing_tds) });
        rows.push({ label: seasonViewMode === 'totals' ? 'Receptions' : 'Rec/Tgt (Avg)', value: formatPair(s.receptions, s.targets) });
        rows.push({ label: 'Rec Yards', value: formatStat(s.receiving_yards) });
        rows.push({ label: 'Rec TDs', value: formatStat(s.receiving_tds) });
      } else if (pos === 'WR' || pos === 'TE') {
        rows.push({ label: seasonViewMode === 'totals' ? 'Receptions' : 'Rec/Tgt (Avg)', value: formatPair(s.receptions, s.targets) });
        rows.push({ label: 'Rec Yards', value: formatStat(s.receiving_yards) });
        rows.push({ label: 'Rec TDs', value: formatStat(s.receiving_tds) });
        if ((s.carries ?? 0) > 0) {
          rows.push({ label: 'Carries', value: formatStat(s.carries) });
          rows.push({ label: 'Rush Yards', value: formatStat(s.rushing_yards) });
        }
      } else if (pos === 'K') {
        rows.push({ label: seasonViewMode === 'totals' ? 'FG Made/Att' : 'FG M/A (Avg)', value: formatPair(s.fg_made, s.fg_att) });
        rows.push({ label: seasonViewMode === 'totals' ? 'XP Made/Att' : 'XP M/A (Avg)', value: formatPair(s.pat_made, s.pat_att) });
      } else if (pos === 'DEF') {
        rows.push({ label: 'Sacks', value: formatStat(s.def_sacks) });
        rows.push({ label: 'INTs', value: formatStat(s.def_interceptions) });
        rows.push({ label: 'Fumbles Forced', value: formatStat(s.def_fumbles_forced) });
        rows.push({ label: 'Fumbles Rec', value: formatStat(s.fumbles_recovered) });
        rows.push({ label: 'TDs', value: formatStat(s.def_tds) });
        rows.push({ label: 'Safeties', value: formatStat(s.def_safeties) });
        rows.push({ label: 'Pts Allowed', value: formatStat(s.points_allowed) });
      } else if (isIndividualDefensivePosition(pos)) {
        rows.push({ label: 'Tackles', value: formatStat(s.def_tackles_solo) });
        rows.push({ label: 'Assists', value: formatStat(s.def_tackles_with_assist) });
        rows.push({ label: 'TFL', value: formatStat(s.def_tackles_for_loss) });
        rows.push({ label: 'Sacks', value: formatStat(s.def_sacks) });
        rows.push({ label: 'INTs', value: formatStat(s.def_interceptions) });
        rows.push({ label: 'Pass Def', value: formatStat(s.def_pass_defended) });
        rows.push({ label: 'Forced Fum', value: formatStat(s.def_fumbles_forced) });
        if ((s.def_tds ?? 0) > 0) rows.push({ label: 'TDs', value: formatStat(s.def_tds) });
        if ((s.def_qb_hits ?? 0) > 0) rows.push({ label: 'QB Hits', value: formatStat(s.def_qb_hits) });
      }
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Season Stats</Text>
        <View style={styles.seasonScopeRow}>
          <TouchableOpacity
            style={[styles.seasonScopeButton, seasonScope === 'regular' && styles.seasonScopeButtonActive]}
            onPress={() => setSeasonScope('regular')}
          >
            <Text style={[styles.seasonScopeText, seasonScope === 'regular' && styles.seasonScopeTextActive]}>
              Regular Season
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.seasonScopeButton, seasonScope === 'post' && styles.seasonScopeButtonActive]}
            onPress={() => setSeasonScope('post')}
          >
            <Text style={[styles.seasonScopeText, seasonScope === 'post' && styles.seasonScopeTextActive]}>
              Post Season
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.seasonScopeButton, seasonScope === 'whole' && styles.seasonScopeButtonActive]}
            onPress={() => setSeasonScope('whole')}
          >
            <Text style={[styles.seasonScopeText, seasonScope === 'whole' && styles.seasonScopeTextActive]}>
              Whole Season
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.seasonScopeRow}>
          <TouchableOpacity
            style={[styles.seasonScopeButton, seasonViewMode === 'totals' && styles.seasonScopeButtonActive]}
            onPress={() => setSeasonViewMode('totals')}
          >
            <Text style={[styles.seasonScopeText, seasonViewMode === 'totals' && styles.seasonScopeTextActive]}>
              Season Totals
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.seasonScopeButton, seasonViewMode === 'averages' && styles.seasonScopeButtonActive]}
            onPress={() => setSeasonViewMode('averages')}
          >
            <Text style={[styles.seasonScopeText, seasonViewMode === 'averages' && styles.seasonScopeTextActive]}>
              Averages
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.seasonGrid}>
          {loadingPlayerStats ? (
            <Text style={styles.statLine}>Loading Stats...</Text>
          ) : rows.length > 0 ? (
            rows.map((row) => (
              <View key={row.label} style={styles.seasonCell}>
                <Text style={styles.seasonValue}>{row.value}</Text>
                <Text style={styles.seasonLabel}>{row.label}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.statLine}>No stats available for selected season</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>

      {/* ========================= */}
      {/* PLAYER HEADER */}
      {/* ========================= */}

      <View style={styles.header}>

        <Image
          source={{
            uri:
              player.position === "DEF"
                ? getTeamLogo(displayTeam)
                : stats?.headshot_url || getHeadshotUrl(player)
          }}
          style={styles.headshot}
        />

        <Text style={styles.playerName}>{player.full_name}</Text>

        <Text style={styles.playerInfo}>
          {player.position} • {displayTeam}
        </Text>

      </View>

      {/* ========================= */}
      {/* CURRENT WEEK STATS */}
      {/* ========================= */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Week {week} Stats
        </Text>

        {loadingPlayerStats ? (
          <Text style={styles.statLine}>Loading Stats...</Text>
        ) : allWeeksStats[week] ? (() => {
          const currentStats = allWeeksStats[week];
          const statLines = formatPlayerStats(player.position, currentStats);
          const isIndividualDefender = isIndividualDefensivePosition(player.position);
          const injuryStatus = String(currentStats?.injury_status ?? "").toUpperCase().trim();
          const isOut = ["OUT", "IR", "IR-R", "INJURED RESERVE"].includes(injuryStatus);
          const isQuestionable = ["QUESTIONABLE", "DOUBTFUL"].includes(injuryStatus);
          const hasInjury = isOut || isQuestionable;
          const injuryType = currentStats?.primary_injury || currentStats?.practice_primary_injury || currentStats?.secondary_injury || "";
          const statusLabel = isOut ? "Out" : isQuestionable ? "Questionable" : "";
          
          return (
            <>
              {hasInjury && (
                <Text style={{ fontSize: 16, color: isOut ? "#e53e3e" : "#d69e2e", marginBottom: 8 }}>
                  {statusLabel}: {injuryType || "Unknown injury"}
                </Text>
              )}
              {statLines.length > 0 ? (
                <>
                  {statLines.map((line: string, index: number) => (
                    <Text key={index} style={styles.statLine}>
                      {line}
                    </Text>
                  ))}
                  {!isIndividualDefender && (
                    <Text style={styles.fantasyPoints}>
                      {currentStats.fantasy_points_ppr ? Number(currentStats.fantasy_points_ppr).toFixed(2) : '0.00'} pts
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.statLine}>
                  No stats recorded
                </Text>
              )}
            </>
          );
        })() : (
          <Text style={styles.statLine}>
            No stats available
          </Text>
        )}
      </View>

      {/* ========================= */}
      {/* SEASON STATS */}
      {/* ========================= */}

      {renderSeasonStats()}

      {String(player.position || '').toUpperCase().trim() === 'DEF' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Defense Roster</Text>
          <TouchableOpacity
            style={styles.defenseRosterButton}
            onPress={() =>
              navigation.navigate('DefenseRoster', {
                team: displayTeam,
                week,
              })
            }
          >
            <Text style={styles.defenseRosterButtonText}>View Full Defensive Roster</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>News</Text>
        <View style={styles.newsTabsRow}>
          <TouchableOpacity
            style={[styles.newsTabButton, newsTab === 'player' && styles.newsTabButtonActive]}
            onPress={() => setNewsTab('player')}
          >
            <Text style={[styles.newsTabText, newsTab === 'player' && styles.newsTabTextActive]}>Player News</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.newsTabButton, newsTab === 'team' && styles.newsTabButtonActive]}
            onPress={() => setNewsTab('team')}
          >
            <Text style={[styles.newsTabText, newsTab === 'team' && styles.newsTabTextActive]}>Team News</Text>
          </TouchableOpacity>
        </View>
        {newsTab === 'player' ? renderNewsCards(playerNews) : renderNewsCards(teamNews)}
      </View>

      {/* ========================= */}
      {/* WEEK STATS LOG */}
      {/* ========================= */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Weekly Stats Log
        </Text>

        <ScrollView style={styles.weeklyLogContainer} showsVerticalScrollIndicator={true}>
          {loadingPlayerStats ? (
            <Text style={styles.statLine}>Loading Stats...</Text>
          ) : Array.from({ length: 22 }, (_, i) => i + 1).map((w: number) => {
            const weekStats = allWeeksStats[w];
            const statLines = weekStats ? formatPlayerStats(player.position, weekStats) : [];
            const isIndividualDefender = isIndividualDefensivePosition(player.position);
            
            // Try to get injury info from stats, or provide placeholder
            const injuryStatus = weekStats ? String(weekStats?.injury_status ?? "").toUpperCase().trim() : "";
            const isOut = ["OUT", "IR", "IR-R", "INJURED RESERVE"].includes(injuryStatus);
            const isQuestionable = ["QUESTIONABLE", "DOUBTFUL"].includes(injuryStatus);
            const hasInjury = isOut || isQuestionable;
            const injuryType = weekStats ? (weekStats?.primary_injury || weekStats?.practice_primary_injury || weekStats?.secondary_injury || "") : "";
            const statusLabel = isOut ? "Out" : isQuestionable ? "Questionable" : "";
            const teamDidNotPlayPostseasonRound = w >= 19 && w <= 22 && !weekStats && teamPlayedPostseasonByWeek[w] === false;

            return (
              <View key={w} style={[styles.weekBlock, { backgroundColor: getWeekCardBackground(weekStats) }]}>
                <Text style={styles.weekTitle}>{getWeekLabel(w)}</Text>
                
                {/* Show injury info if applicable */}
                {hasInjury && (
                  <Text style={{ fontSize: 16, color: isOut ? "#e53e3e" : "#d69e2e", marginBottom: 4 }}>
                    {statusLabel}: {injuryType || "Unknown injury"}
                  </Text>
                )}
                
                {/* Show fantasy points if stats exist */}
                {weekStats && !isIndividualDefender && (
                  <Text style={styles.weekFantasyPoints}>
                    {weekStats.fantasy_points_ppr ? Number(weekStats.fantasy_points_ppr).toFixed(2) : '0.00'} pts
                  </Text>
                )}
                
                {/* Show stats or message */}
                {statLines.length > 0 ? (
                  statLines.map((line: string, index: number) => (
                    <Text key={index} style={styles.statLine}>
                      {line}
                    </Text>
                  ))
                ) : hasInjury ? (
                  // Injury info already shown above, no additional message needed
                  null
                ) : teamDidNotPlayPostseasonRound ? (
                  <Text style={styles.statLine}>
                    Team did not play this round
                  </Text>
                ) : (
                  <Text style={styles.statLine}>
                    No stats recorded
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#fff"
  },

  header: {
    alignItems: "center",
    padding: 20
  },

  headshot: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 10
  },

  playerName: {
    fontSize: 26,
    fontWeight: "700"
  },

  playerInfo: {
    fontSize: 16,
    color: "#666",
    marginTop: 4
  },

  positionBadge: {
    position: "absolute",
    top: 15,
    left: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },

  positionText: {
    color: "#fff",
    fontWeight: "700"
  },

  section: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderColor: "#eee"
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10
  },

  statLine: {
    fontSize: 16,
    marginBottom: 6
  },

  weekBlock: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 8
  },

  weekTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333"
  },

  weeklyLogContainer: {
    height: 500, // Fixed height for scrollable log
    backgroundColor: "#f4f6fc",
    borderRadius: 8,
    padding: 10
  },

  weekFantasyPoints: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4f46e5",
    marginTop: 8
  },

  fantasyPoints: {
    fontSize: 28,
    fontWeight: "800",
    color: "#4f46e5"
  },

  seasonScopeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },

  seasonScopeButton: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#f1f3f8',
    borderWidth: 1,
    borderColor: '#d9deea',
  },

  seasonScopeButtonActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },

  seasonScopeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
  },

  seasonScopeTextActive: {
    color: '#fff',
  },

  seasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },

  seasonCell: {
    width: '33.3%',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 6,
    backgroundColor: '#f4f6fc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e8eaf0',
  },

  seasonValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e1e1e',
  },

  seasonLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
  },

  newsTabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },

  newsTabButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f1f3f8',
    borderWidth: 1,
    borderColor: '#d9deea',
  },

  newsTabButtonActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },

  newsTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },

  newsTabTextActive: {
    color: '#fff',
  },

  newsCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e9f2',
    backgroundColor: '#f8f9fc',
    marginBottom: 10,
  },

  newsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 6,
  },

  newsSummary: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 8,
  },

  newsMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  newsMetaText: {
    fontSize: 12,
    color: '#6b7280',
  },

  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },

  impactBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  defenseRosterButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    alignItems: 'center',
  },

  defenseRosterButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3730a3',
  },

});