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
import { getPlayerStatsByWeek, getSeasonWeekStatuses, type WeekStatus } from '../services/nflApi';
import { getLeagueUsers, getPlayersFromGithub, getRosters } from '../services/sleeperAPI';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../AppNavigator';
import { useFantasy } from '../context/FantasyContext';
import { selectDiverseNews } from '../services/newsDiversity';
import { getAvailableStatSeasons, getNewsFiles, getNewsUpdatedAt, TEAM_NEWS_FILES } from '../services/newsService';
import { fetchArticleImages, timeAgo } from '../services/leagueNews';
import { playedPoints, pointRange } from '../backend/utils/pointRange';
import { toggleFavoritePlayer, toggleFavoriteTeam, useFavorites } from '../services/favorites';
import { ownershipMap, type Ownership } from '../services/leagueOwnership';
import TradeForSheet from '../components/TradeForSheet';
import NewsCardRow from '../components/NewsCardRow';
import InjuryReportCard from '../components/InjuryReportCard';

import { useTheme, useLooseThemedStyles } from '../context/ThemeContext';
import { positionColors, type Palette } from '../theme';
import { getPlayerRanks, ordinal, type PlayerRank } from '../services/playerRanks';

type NewsArticle = {
  title: string;
  summary?: string;
  source?: string;
  category?: string;
  link?: string;
  published?: string;
  player?: string;
  impact?: string;
  // Real article address and cover image (from nfl-data's news job)
  url?: string;
  image?: string;
};

// NFL seasons are labeled by the year they start; Jan-Feb games belong to the previous season
const getCurrentNFLSeason = () => {
  const now = new Date();
  return now.getMonth() + 1 >= 3 ? now.getFullYear() : now.getFullYear() - 1;
};

// First NFL season for a player. Prefer Sleeper's `metadata.rookie_year`; otherwise derive it
// from `years_exp`, which Sleeper defines as completed seasons (a 3rd-year player has years_exp 2).
const getRookieSeason = (player: any, stats?: any): number | null => {
  const rookieYear = Number(player?.metadata?.rookie_year ?? player?.rookie_year);
  if (Number.isInteger(rookieYear) && rookieYear > 1900) return rookieYear;

  const yearsExp = player?.years_exp ?? stats?.years_exp;
  if (yearsExp === null || yearsExp === undefined || !Number.isFinite(Number(yearsExp))) return null;
  return getCurrentNFLSeason() - Number(yearsExp);
};

export default function PlayerDetailsScreen({ route }: any) {
  const { colors: th } = useTheme();
  const styles = useLooseThemedStyles(makeStyles);
  type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
  const navigation = useNavigation<NavigationProp>();
  const { player, stats, week, fantasyPoints } = route.params;
  const { myTeam, sendChatMessage, isChatTyping, activeLeagueId } = useFantasy();
  const displayTeam = String(stats?.team || player?.team || 'N/A');

  const [allWeeksStats, setAllWeeksStats] = useState<any>({});
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<number>(getCurrentNFLSeason);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState<boolean>(false);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>(() => [getCurrentNFLSeason()]);
  const [displaySeasons, setDisplaySeasons] = useState<number[]>(() => [getCurrentNFLSeason()]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState<string | null>(null);
  const [newsTab, setNewsTab] = useState<'player' | 'team'>('player');
  const [seasonScope, setSeasonScope] = useState<'whole' | 'regular' | 'post'>('regular');
  const [seasonViewMode, setSeasonViewMode] = useState<'totals' | 'averages'>('totals');
  const [teamPlayedPostseasonByWeek, setTeamPlayedPostseasonByWeek] = useState<Record<number, boolean>>({});
  const [weekStatuses, setWeekStatuses] = useState<Record<number, WeekStatus>>({});
  const [playerNews, setPlayerNews] = useState<NewsArticle[]>([]);
  const [teamNews, setTeamNews] = useState<NewsArticle[]>([]);
  const [newsImages, setNewsImages] = useState<Record<string, string | null>>({});
  const favorites = useFavorites();
  const [showTradeFor, setShowTradeFor] = useState(false);
  // Who has him in your open league (your team, another team, or nobody).
  const [owner, setOwner] = useState<Ownership | null | undefined>(undefined);
  // Fantasy rank this season (overall / at his position) with your league's scoring
  const [rank, setRank] = useState<PlayerRank | null>(null);
  // The season `allWeeksStats` holds, so the weekly range never shows another season's numbers
  const [statsSeason, setStatsSeason] = useState<number | null>(null);
  useEffect(() => {
    setOwner(undefined);
    if (!activeLeagueId || !player?.player_id) return;
    let cancelled = false;
    Promise.all([getRosters(activeLeagueId), getLeagueUsers(activeLeagueId).catch(() => [])])
      .then(([rosters, users]) => {
        if (!cancelled) setOwner(ownershipMap(rosters, users, myTeam?.ownerId).get(String(player.player_id)) ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeLeagueId, player?.player_id, myTeam?.ownerId]);


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

  const basePosition = String(player?.position_for_FFHelper || player?.position || player?.position_listed_on_sleeper || '').toUpperCase().trim();
  // Sleeper has no full_name for team defenses ("Houston" + "Texans").
  const playerName = String(player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || player?.player_id || '');
  const shortName = basePosition === 'DEF' ? playerName : player?.first_name || 'him';

  const getNewsFileKey = (position?: string) => {
    const pos = String(position || '').toUpperCase().trim();
    if (pos === 'QB') return 'qb';
    if (pos === 'RB') return 'rb';
    if (pos === 'WR') return 'wr';
    if (pos === 'TE') return 'te';
    if (pos === 'K' || pos === 'PK' || pos === 'P') return 'k';
    if (pos === 'C') return 'c';
    if (pos === 'CB') return 'cb';
    if (pos === 'DB') return 'db';
    if (pos === 'DL') return 'dl';
    if (pos === 'LB') return 'lb';
    if (pos === 'DE') return 'dl';
    if (pos === 'DT') return 'dl';
    if (pos === 'SS') return 'db';
    if (pos === 'FS') return 'db';
    // Offensive line / tackle / guard positions
    if (pos === 'G') return 'g';
    if (pos === 'OG') return 'og';
    if (pos === 'OL') return 'ol';
    if (pos === 'OT') return 'ot';
    if (pos === 'T') return 't';

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

  // Weekly range for the season you're looking at: the last 10 games of the current season
  // (recent form), or the whole regular season for a past one.
  const isCurrentSeason = selectedSeason === getCurrentNFLSeason();
  const range = useMemo(
    () =>
      pointRange(
        playedPoints(Object.entries(allWeeksStats).map(([w, s]: [string, any]) => ({ ...s, week: Number(w) })).filter(r => Number(r.week) <= 18)),
        isCurrentSeason ? 10 : 18
      ),
    [allWeeksStats, isCurrentSeason]
  );

  const getWeekCardBackground = (weekStats: any) => {
    const defaultColor = th.surfaceMuted;
    const posForWeek = String(weekStats?.position || player?.position_for_FFHelper || player?.position || '').toUpperCase().trim();
    if (isIndividualDefensivePosition(posForWeek)) return defaultColor;
    if (!weekStats || seasonAvgFantasyPoints === null) return defaultColor;

    const weekFantasyPoints = Number(weekStats?.fantasy_points_ppr);
    if (!Number.isFinite(weekFantasyPoints)) return defaultColor;

    // "Around average" uses a tolerance band to avoid tiny differences flipping colors.
    const tolerance = Math.max(1, seasonAvgFantasyPoints * 0.1);
    if (Math.abs(weekFantasyPoints - seasonAvgFantasyPoints) <= tolerance) return th.warningSoft; // around average
    if (weekFantasyPoints > seasonAvgFantasyPoints + tolerance) return th.successSoft; // above average
    return th.dangerSoft; // below average
  };

  const getWeekLabel = (weekNumber: number) => {
    if (weekNumber === 19) return 'Wild Card Round';
    if (weekNumber === 20) return 'Divisional Round';
    if (weekNumber === 21) return 'Conference Championship';
    if (weekNumber === 22) return 'Super Bowl';
    return `Week ${weekNumber}`;
  };

  // Helper: quick flags for UI messaging
  const isRookie = (getRookieSeason(player, stats) ?? getCurrentNFLSeason()) >= getCurrentNFLSeason();
  const repoMostRecentSeason = (availableSeasons && availableSeasons.length > 0) ? availableSeasons[0] : null;
  const _now = new Date();
  const _month = _now.getMonth() + 1;
  const dateBasedMostRecentSeason = _month >= 3 ? _now.getFullYear() : _now.getFullYear() - 1;
  const mostRecentSeasonRef = repoMostRecentSeason ?? dateBasedMostRecentSeason;

  // Helper: decide if a season is "completed" relative to today.
  const isSeasonCompleted = (seasonNum: number) => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // 1-based
      // NFL season labeled by year (e.g., 2025 season completes in early 2026).
      // Treat a season as completed if its year is strictly less than current year,
      // or if it's equal to the current year and we're past March (post-SuperBowl window).
      if (seasonNum < year) return true;
      if (seasonNum === year && month >= 3) return true;
      return false;
    } catch (e) {
      return false;
    }
  };

  useEffect(() => {
    // On mount: detect available seasons from GitHub repo and update dropdown
    const detectSeasons = async () => {
      try {
        // Cached for a day (GitHub's API allows 60 requests/hour without a login).
        const seasons = await getAvailableStatSeasons();

        if (seasons.length > 0) {
          seasons.sort((a, b) => b - a);
          setAvailableSeasons(seasons);
          if (!seasons.includes(selectedSeason)) setSelectedSeason(seasons[0]);
        }
      } catch (err) {
        console.warn('Could not detect seasons from GitHub:', err);
      }
    };
    detectSeasons();

    // Helper: decide if a season is "completed" relative to today.
    const isSeasonCompleted = (seasonNum: number) => {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // 1-based
        // NFL season labeled by year (e.g., 2025 season completes in early 2026).
        // Treat a season as completed if its year is strictly less than current year,
        // or if it's equal to the current year and we're past March (post-SuperBowl window).
        if (seasonNum < year) return true;
        if (seasonNum === year && month >= 3) return true;
        return false;
      } catch (e) {
        return false;
      }
    };

    const fetchAllWeeks = async () => {
      setLoadingPlayerStats(true);
      try {
        const weeks = Array.from({ length: 22 }, (_, i) => i + 1);
        // Generic per-season week fetcher: attempt to load offense+defense JSON files
        // from the GitHub repo matching the season's folder structure. Falls back
        // to the existing backend / service call when GitHub files aren't available.
        const fetchWeekForSeason = async (seasonNum: number, w: number) => {
          try {
            const seasonStr = String(seasonNum);
            const baseSeasonPath = `https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/Stats/${encodeURIComponent(seasonStr + ' Season')}/${seasonStr} Offense`;
            const baseDefPath = `https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/Stats/${encodeURIComponent(seasonStr + ' Season')}/${seasonStr} Defense`;
            const fileName = `player_stats_${seasonStr}_week${String(w).padStart(2, '0')}.json`;

            const [offResp, defResp] = await Promise.all([
              fetch(`${baseSeasonPath}/${fileName}`),
              fetch(`${baseDefPath}/${fileName}`),
            ]);

            const offData = offResp.ok ? await offResp.json() : null;
            const defData = defResp.ok ? await defResp.json() : null;

            if (!offData && !defData) {
              // nothing on GitHub for this season/week — fall back to service
              try {
                return await getPlayerStatsByWeek(w, seasonNum);
              } catch (err) {
                console.warn(`Backend unavailable for week ${w}, season ${seasonNum}:`, err);
                return [];
              }
            }

            const offRows = Array.isArray(offData) ? offData : (offData ? Object.values(offData).flat() : []);
            const defRows = Array.isArray(defData) ? defData : (defData ? Object.values(defData).flat() : []);

            const map = new Map<string, any>();
            offRows.forEach((r: any) => map.set(String(r.player_id), r));
            defRows.forEach((r: any) => {
              const id = String(r.player_id);
              if (id.startsWith('DEF_')) map.set(id, r);
              else if (!map.has(id)) map.set(id, r);
            });

            return Array.from(map.values());
          } catch (err) {
            console.warn(`Failed to fetch week ${w} for season ${seasonNum}:`, err);
            try {
              return await getPlayerStatsByWeek(w, seasonNum);
            } catch (err2) {
              console.warn(`Fallback backend also failed for week ${w}, season ${seasonNum}:`, err2);
              return [];
            }
          }
        };

        const promises = weeks.map(w => fetchWeekForSeason(selectedSeason, w));
        const results = await Promise.all(promises);

        const statsMap: any = {};
        const postseasonPlayed: Record<number, boolean> = {};
        const playerTeam = normalizeTeam(player?.team || stats?.team || '');

        results.forEach((data, index) => {
          const w = index + 1;
          const playerStats = getPlayerNFLStats(player.player_id, w, data);

          // Include rows that have meaningful stats, injury info, or an explicit team_status
          const hasTeamStatus = playerStats && String(playerStats?.team_status ?? '').trim() !== '';
          if (playerStats && (hasMeaningfulStats(playerStats) || hasInjuryInfo(playerStats) || hasTeamStatus)) {
            statsMap[w] = playerStats;
          }

          if (w >= 19 && w <= 22) {
            const rows = Array.isArray(data) ? data : (Object.values(data ?? {}).flat() as any[]);
            postseasonPlayed[w] = rows.some((row: any) => normalizeTeam(row?.team) === playerTeam);
          }
        });
        // Attach team defense rows (if present) to the stats map so we can show team DEF per-week.
        // Important: do not create an empty statsMap[w] entry when only the team DEF row exists
        // for an individual player — that causes games to be counted for players with no data
        // (e.g., rookies). Only attach `_team_def` when the main player row already exists,
        // or when we're viewing a team DEF player.
        results.forEach((data, index) => {
          const w = index + 1;
          const rows = Array.isArray(data) ? data : (Object.values(data ?? {}).flat() as any[]);
          const defId = `DEF_${playerTeam}`;
          const teamDef = rows.find((r: any) => String(r.player_id) === defId) || null;
          if (!teamDef) return;

          const isViewingTeamDef = String(player.position || player.position_for_FFHelper || '').toUpperCase().trim() === 'DEF';

          if (statsMap[w] && Object.keys(statsMap[w]).length > 0) {
            // main player row exists for this week — attach team DEF for reference
            (statsMap[w] as any)._team_def = teamDef;
          } else if (isViewingTeamDef) {
            // if the page is for a team DEF, create the week entry using the team DEF row
            statsMap[w] = statsMap[w] || {};
            (statsMap[w] as any)._team_def = teamDef;
          }
        });
        setAllWeeksStats(statsMap);
        setStatsSeason(selectedSeason);
        setTeamPlayedPostseasonByWeek(postseasonPlayed);
      } catch (err) {
        console.error('Error fetching player stats:', err);
      } finally {
        setLoadingPlayerStats(false);
      }
    };
    fetchAllWeeks();
  }, [player, selectedSeason]);

  // Which weeks of the selected season have been played (vs. upcoming / in progress)
  useEffect(() => {
    let cancelled = false;
    setWeekStatuses({});
    getSeasonWeekStatuses(selectedSeason)
      .then(statuses => { if (!cancelled) setWeekStatuses(statuses); })
      .catch(err => console.warn('Could not load week statuses:', err));
    return () => {
      cancelled = true;
    };
  }, [selectedSeason]);

  // Compute which seasons to show for this player based on `years_exp`.
  useEffect(() => {
    const compute = async () => {
      const sorted = Array.from(new Set(availableSeasons)).sort((a, b) => b - a);

      const now = new Date();
      const month = now.getMonth() + 1; // 1-based
      // Prefer the most recent season folder detected on GitHub. If none exist,
      // fall back to the date-based cutoff (March) to infer the most-recent season.
      const mostRecentSeasonFromRepo = sorted.length > 0 ? sorted[0] : null;
      const dateBasedMostRecent = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const mostRecentSeason = mostRecentSeasonFromRepo ?? dateBasedMostRecent;
      // Every season from the player's rookie year through the most recent season,
      // e.g. rookie year 2024 => [2026, 2025, 2024]
      const rookieSeason = Math.min(getRookieSeason(player, stats) ?? mostRecentSeason, mostRecentSeason);
      const count = mostRecentSeason - rookieSeason + 1;
      const desired = Array.from({ length: count }, (_, i) => mostRecentSeason - i);

      // Probe GitHub raw URLs for existence of a canonical file (week01 offense)
      // for each desired season. This avoids relying on the GitHub API which may
      // be rate-limited or unavailable in-app.
      const checkSeasonExists = async (s: number) => {
        try {
          const seasonStr = String(s);
          const fileName = `player_stats_${seasonStr}_week01.json`;
          const url = `https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data/Stats/${encodeURIComponent(seasonStr + ' Season')}/${seasonStr} Offense/${fileName}`;
          const resp = await fetch(url);
          return resp.ok;
        } catch (e) {
          return false;
        }
      };

      const existence = await Promise.all(desired.map((s) => checkSeasonExists(s)));
      const existing = desired.filter((_, idx) => existence[idx]);

      if (existing.length > 0) {
        setDisplaySeasons(existing);
        if (!existing.includes(selectedSeason)) setSelectedSeason(existing[0]);
      } else {
        // If none of the desired seasons exist in the repo, fall back to the most recent
        // available seasons discovered in the repo (up to `count`).
        const fallback = sorted.slice(0, Math.min(count, sorted.length));
        setDisplaySeasons(fallback);
        if (fallback.length > 0 && !fallback.includes(selectedSeason)) setSelectedSeason(fallback[0]);
      }
    };
    compute();
  }, [availableSeasons, player]);

  useEffect(() => {
    const loadNews = async () => {
      setLoadingNews(true);
      try {
        const fileKey = getNewsFileKey(player?.position || player?.position_for_FFHelper);
        if (!fileKey) {
          setPlayerNews([]);
          setTeamNews([]);
          return;
        }

        getNewsUpdatedAt().then(setNewsUpdatedAt);
        // The player's own position file plus the main offensive files for team news (cached).
        const newsList = (await getNewsFiles([fileKey, ...TEAM_NEWS_FILES])) as NewsArticle[];

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

        // Up to 3 articles each, covering different stories (and different teammates).
        const pickedPlayer = selectDiverseNews(onlyPlayerNews, 3) as NewsArticle[];
        const pickedTeam = selectDiverseNews(onlyTeamNews, 3, { onePerPlayer: true }) as NewsArticle[];
        setPlayerNews(pickedPlayer);
        setTeamNews(pickedTeam);
        // Each article's picture (or the player's headshot) loads in after the text.
        fetchArticleImages([...pickedPlayer, ...pickedTeam].map(a => ({ link: a.link, player: a.player, image: a.image })))
          .then(setNewsImages)
          .catch(() => undefined);
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
        backgroundColor: th.surfaceMuted,
        borderColor: th.border,
        textColor: th.textMuted,
      };
    }

    if (raw === 'positive') {
      return {
        label: 'Positive',
        backgroundColor: th.successSoft,
        borderColor: th.success,
        textColor: th.success,
      };
    }

    if (raw === 'negative') {
      return {
        label: 'Negative',
        backgroundColor: th.dangerSoft,
        borderColor: th.danger,
        textColor: th.danger,
      };
    }

    if (raw === 'slightly_negative') {
      return {
        label: 'Monitor',
        backgroundColor: th.warningSoft,
        borderColor: th.warning,
        textColor: th.warning,
      };
    }

    if (raw === 'neutral') {
      return {
        label: 'Neutral',
        backgroundColor: th.surfaceMuted,
        borderColor: th.border,
        textColor: th.textMuted,
      };
    }

    if (raw === 'roster_move' || raw === 'roster move' || raw === 'transaction') {
      return {
        label: 'Roster Move',
        backgroundColor: th.primarySoft,
        borderColor: th.border,
        textColor: th.primary,
      };
    }

    const titleCase = raw
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    return {
      label: titleCase || 'General',
      backgroundColor: th.surfaceMuted,
      borderColor: th.border,
      textColor: th.textMuted,
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

    // Same cards as "Around the League" on Home, scrolling sideways.
    return (
      <View style={{ marginHorizontal: -16 }}>
        <NewsCardRow items={articles} images={newsImages} />
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
    const sleeperPosition = String(sleeperPlayer.position_for_FFHelper || sleeperPlayer.position || sleeperPlayer.position_listed_on_sleeper || '').toUpperCase().trim();
    if (sleeperPosition === "DEF") {
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

      // fumble recoveries may appear as `def_fumbles_recovered` or `fumble_recovery_opp`
      const defFumbleRecovered = Number(stats.def_fumbles_recovered ?? stats.fumble_recovery_opp ?? 0);
      if (defFumbleRecovered > 0) defense.push(`${defFumbleRecovered} FR`);

      if (stats.def_tds > 0)
        defense.push(`${stats.def_tds} TD`);

      if (defense.length) lines.push(defense.join(", "));
    }

    // Team DEF (aggregate defensive team row)
    if (pos === 'DEF') {
      const sacks             = Number(stats.def_sacks ?? 0);
      const interceptions     = Number(stats.def_interceptions ?? 0);
      const fumblesForced     = Number(stats.def_fumbles_forced ?? 0);
      // fumble recoveries may be under `fumbles_recovered` or `fumble_recovery_opp`
      const fumblesRecovered  = Number(stats.fumbles_recovered ?? stats.fumble_recovery_opp ?? 0);
      const defTDs            = Number(stats.def_tds ?? 0);
      const stTDs             = Number(stats.special_teams_tds ?? 0);
      const safeties          = Number(stats.def_safeties ?? 0);
      const pointsAllowed     = Number(stats.points_allowed ?? 0);

      const defenseLines: string[] = [];
      if (sacks > 0)            defenseLines.push(`${sacks} SACK`);
      if (interceptions > 0)    defenseLines.push(`${interceptions} INT`);
      if (fumblesForced > 0)    defenseLines.push(`${fumblesForced} FF`);
      if (fumblesRecovered > 0) defenseLines.push(`${fumblesRecovered} FR`);
      if (defTDs + stTDs > 0)   defenseLines.push(`${defTDs + stTDs} TD`);
      if (safeties > 0)         defenseLines.push(`${safeties} SFTY`);
      if (defenseLines.length)  lines.push(defenseLines.join(", "));

      // always show points allowed (can be zero)
      lines.push(`${pointsAllowed} PTS ALLOWED`);
      return lines;
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

    let weeks = filteredWeekNumbers
      .sort((a, b) => a - b)
      .map((w) => ({ num: w, data: allWeeksStats[w] }));

    // For postseason view, exclude weeks where the player's row explicitly marks the team as eliminated
    if (seasonScope === 'post') {
      weeks = weeks.filter((wk: any) => {
        const teamStatus = String(wk.data?.team_status ?? wk.data?._team_def?.team_status ?? '').toLowerCase().trim();
        return teamStatus !== 'eliminated';
      });
    }

    if (weeks.length === 0) return null;

    const pos = String(player.position_for_FFHelper || player.position || '').trim().toUpperCase();
    const playedWC = Boolean(teamPlayedPostseasonByWeek[19]);
    const playedDiv = Boolean(teamPlayedPostseasonByWeek[20]);

    const sum = (key: string) => weeks.reduce((acc: number, wk: any) => acc + (Number(wk.data?.[key]) || 0), 0);

    // Fantasy points sum: for 'regular' scope we exclude Week 18 from fantasy points
    // (stats still include Week 18). For 'post' and 'whole' we sum the weeks in `weeks`.
    const fantasyPointsSum = () => {
      if (seasonScope === 'regular') {
        return weeks.reduce((acc: number, wk: any) => {
          const wkNum = Number(wk.num);
          if (wkNum >= 1 && wkNum <= 17) return acc + (Number(wk.data?.fantasy_points_ppr) || 0);
          return acc;
        }, 0);
      }
      return sum('fantasy_points_ppr');
    };

    const isWeekBye = (wkNum: number, wkData: any) => {
      const teamStatus = String(wkData?.team_status ?? wkData?._team_def?.team_status ?? '').toLowerCase().trim();
      if (teamStatus.includes('bye')) return true;
      // postseason inference
      if (wkNum >= 19 && wkNum <= 22) {
        const playedThisWeek = teamPlayedPostseasonByWeek[wkNum] === true;
        if (!playedThisWeek && (!wkData || Object.keys(wkData).length === 0)) {
          if (wkNum === 19 && !playedWC && playedDiv) return true; // wildcard bye
        }
      }
      return false;
    };

    const countGames = () => weeks.reduce((acc: number, wk: any) => {
      const wkNum = wk.num;
      const wkData = wk.data || {};
      if (isWeekBye(wkNum, wkData)) return acc; // exclude bye weeks
      // count as game if main row indicates game_played OR team DEF row exists
      const teamStatus = String(wkData?.team_status ?? wkData?._team_def?.team_status ?? '').toLowerCase().trim();
      if (Boolean(wkData.game_played) || teamStatus === 'played') return acc + 1;
      if (wkData._team_def) return acc + 1;
      // fallback: if any meaningful stat present for player
      if (hasMeaningfulStats(wkData)) return acc + 1;
      return acc;
    }, 0);

    // If viewing only postseason, compute games played during postseason weeks (19-22)
    const postseasonGamesPlayed = () => {
      return weeks.filter((wk: any) => {
        const wkNum = wk.num;
        if (wkNum < 19 || wkNum > 22) return false;
        const wkData = wk.data || {};
        const teamStatus = String(wkData?.team_status ?? wkData?._team_def?.team_status ?? '').toLowerCase().trim();
        if (Boolean(wkData.game_played) || teamStatus === 'played') return true;
        if (wkData._team_def) return true;
        if (hasMeaningfulStats(wkData)) return true;
        return false;
      }).length;
    };

    // gamesPlayed respects the selected seasonScope
    const gamesPlayed = seasonScope === 'post' ? postseasonGamesPlayed() : countGames();

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
        fantasy_points_ppr: fantasyPointsSum(),
        games: gamesPlayed,
        bye_weeks: seasonScope === 'post' ? 0 : weeks.filter((wk: any) => String((wk.data?.team_status ?? wk.data?._team_def?.team_status) || '').toLowerCase().includes('bye')).length,
        eliminated_weeks: seasonScope === 'post' ? 0 : weeks.filter((wk: any) => String((wk.data?.team_status ?? wk.data?._team_def?.team_status) || '').toLowerCase() === 'eliminated').length,
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
        fantasy_points_ppr: fantasyPointsSum(),
        games: gamesPlayed,
        bye_weeks: seasonScope === 'post' ? 0 : weeks.filter((wk: any) => String((wk.data?.team_status ?? wk.data?._team_def?.team_status) || '').toLowerCase().includes('bye')).length,
        eliminated_weeks: seasonScope === 'post' ? 0 : weeks.filter((wk: any) => String((wk.data?.team_status ?? wk.data?._team_def?.team_status) || '').toLowerCase() === 'eliminated').length,
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
        fantasy_points_ppr: fantasyPointsSum(),
        games: gamesPlayed,
        bye_weeks: seasonScope === 'post' ? 0 : weeks.filter((wk: any) => String((wk.data?.team_status ?? wk.data?._team_def?.team_status) || '').toLowerCase().includes('bye')).length,
        eliminated_weeks: seasonScope === 'post' ? 0 : weeks.filter((wk: any) => String((wk.data?.team_status ?? wk.data?._team_def?.team_status) || '').toLowerCase() === 'eliminated').length,
      };
    }
    if (pos === 'K') {
      return {
        fg_att: sum('fg_att'),
        fg_made: sum('fg_made_0_19') + sum('fg_made_20_29') + sum('fg_made_30_39') + sum('fg_made_40_49') + sum('fg_made_50_59') + sum('fg_made_60_'),
        pat_made: sum('pat_made'),
        pat_att: sum('pat_att'),
        fantasy_points_ppr: fantasyPointsSum(),
        games: gamesPlayed,
        bye_weeks: seasonScope === 'post' ? 0 : weeks.filter((wk: any) => String((wk.data?.team_status ?? wk.data?._team_def?.team_status) || '').toLowerCase().includes('bye')).length,
        eliminated_weeks: seasonScope === 'post' ? 0 : weeks.filter((wk: any) => String((wk.data?.team_status ?? wk.data?._team_def?.team_status) || '').toLowerCase() === 'eliminated').length,
      };
    }
    if (pos === 'DEF') {
      return {
        def_sacks: sum('def_sacks'),
        def_interceptions: sum('def_interceptions'),
        def_fumbles_forced: sum('def_fumbles_forced'),
        // fumble recoveries may appear under `fumbles_recovered` or `fumble_recovery_opp`
        fumbles_recovered: sum('fumbles_recovered') + sum('fumble_recovery_opp'),
        def_tds: sum('def_tds') + sum('special_teams_tds'),
        def_safeties: sum('def_safeties'),
        points_allowed: sum('points_allowed'),
        fantasy_points_ppr: fantasyPointsSum(),
        games: seasonScope === 'post' ? postseasonGamesPlayed() : weeks.filter((w: any) => {
          const wkData = w.data || {};
          const teamStatus = String(wkData?.team_status ?? wkData?._team_def?.team_status ?? '').toLowerCase().trim();
          return Boolean(wkData?.game_played) || teamStatus === 'played' || Boolean(wkData?._team_def);
        }).length,
        bye_weeks: seasonScope === 'post' ? 0 : weeks.filter((w: any) => String(w.data?.team_status || '').toLowerCase().includes('bye')).length,
        eliminated_weeks: seasonScope === 'post' ? 0 : weeks.filter((w: any) => String(w.data?.team_status || '').toLowerCase() === 'eliminated').length,
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
        // include fumble recoveries from either key
        fumbles_recovered: sum('fumbles_recovered') + sum('fumble_recovery_opp'),
        def_tds: sum('def_tds'),
        def_qb_hits: sum('def_qb_hits'),
        fantasy_points_ppr: fantasyPointsSum(),
        games: seasonScope === 'post' ? postseasonGamesPlayed() : weeks.filter((w: any) => Boolean(w.data?.game_played)).length,
        bye_weeks: seasonScope === 'post' ? 0 : weeks.filter((w: any) => String(w.data?.team_status || '').toLowerCase().includes('bye')).length,
        eliminated_weeks: seasonScope === 'post' ? 0 : weeks.filter((w: any) => String(w.data?.team_status || '').toLowerCase() === 'eliminated').length,
      };
    }
    return null;
  };

  const renderSeasonStats = () => {
    const pos = String(player.position_for_FFHelper || player.position || '').trim().toUpperCase();
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
      if (Number(s.eliminated_weeks) > 0) rows.push({ label: 'Eliminated Weeks', value: String(s.eliminated_weeks) });
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
        // Show receptions and targets in separate boxes
        rows.push({ label: seasonViewMode === 'totals' ? 'Receptions' : 'Receptions (Avg)', value: formatStat(s.receptions) });
        rows.push({ label: seasonViewMode === 'totals' ? 'Targets' : 'Targets (Avg)', value: formatStat(s.targets) });
        rows.push({ label: 'Rec Yards', value: formatStat(s.receiving_yards) });
        rows.push({ label: 'Rec TDs', value: formatStat(s.receiving_tds) });
      } else if (pos === 'WR' || pos === 'TE') {
        // Show receptions and targets in separate boxes
        rows.push({ label: seasonViewMode === 'totals' ? 'Receptions' : 'Receptions (Avg)', value: formatStat(s.receptions) });
        rows.push({ label: seasonViewMode === 'totals' ? 'Targets' : 'Targets (Avg)', value: formatStat(s.targets) });
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
        rows.push({ label: 'Fumbles Rec', value: formatStat(s.fumbles_recovered) });
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
        {seasonScope === 'regular' && (
          <Text style={styles.disclaimerText}>
            Regular Season — stats: Weeks 1–18. Fantasy points displayed: Weeks 1–17.
          </Text>
        )}
        {seasonScope === 'post' && (
          <Text style={styles.disclaimerText}>
            Post Season — Weeks 19–22 stats (and fantasy points if they were counted).
          </Text>
        )}
        {seasonScope === 'whole' && (
          <Text style={styles.disclaimerText}>
            Whole Season — Weeks 1–22 stats (and fantasy points if Weeks 18–22 were counted).
          </Text>
        )}
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

  useEffect(() => {
    let cancelled = false;
    setRank(null);
    if (!player?.player_id) return;
    getPlayerRanks(activeLeagueId, selectedSeason).then(file => {
      if (!cancelled) setRank(file?.ranks?.[String(player.player_id)] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [player?.player_id, activeLeagueId, selectedSeason]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>

      {/* ========================= */}
      {/* PLAYER HEADER */}
      {/* ========================= */}

      <View style={styles.header}>
        <View style={[styles.headshotRing, { borderColor: positionColors[basePosition] ?? th.border }]}>
          <Image
            source={{
              uri:
                    basePosition === "DEF"
                      ? getTeamLogo(displayTeam)
                      : stats?.headshot_url || getHeadshotUrl(player)
            }}
            style={styles.headshot}
          />
        </View>

        <Text style={styles.playerName}>{playerName}</Text>

        <View style={styles.infoRow}>
          {!!(basePosition || player.position) && (
            <View style={[styles.posPill, { backgroundColor: positionColors[basePosition] ?? th.primary }]}>
              <Text style={styles.posPillText}>{basePosition || player.position}</Text>
            </View>
          )}
          <Text style={styles.playerInfo}>{displayTeam}</Text>
        </View>

        {/* Fantasy rank this season, like Sleeper: at his position and overall */}
        {!!rank && (
          <View style={styles.rankRow}>
            <View style={styles.rankChip}>
              <Text style={styles.rankValue}>{rank.pos}{rank.position}</Text>
              <Text style={styles.rankCaption}>{ordinal(rank.position)} of {rank.positionCount} {rank.pos}s</Text>
            </View>
            <View style={styles.rankChip}>
              <Text style={styles.rankValue}>#{rank.overall}</Text>
              <Text style={styles.rankCaption}>overall</Text>
            </View>
            <View style={styles.rankChip}>
              <Text style={styles.rankValue}>{rank.points.toFixed(2)}</Text>
              <Text style={styles.rankCaption}>fantasy pts{rank.games ? ` · ${rank.games} g` : ''}</Text>
            </View>
          </View>
        )}

        {/* Follow the player (news on Home) and his team */}
        <View style={styles.followRow}>
          {!!player?.player_id && (
            <TouchableOpacity
              style={[styles.followBtn, favorites.players.includes(String(player.player_id)) && styles.followBtnOn]}
              onPress={() => toggleFavoritePlayer(String(player.player_id))}
              accessibilityLabel={favorites.players.includes(String(player.player_id)) ? `Unfollow ${playerName}` : `Follow ${playerName}`}
            >
              <Text style={[styles.followText, favorites.players.includes(String(player.player_id)) && styles.followTextOn]}>
                {favorites.players.includes(String(player.player_id)) ? '★ Following' : '☆ Follow'}
              </Text>
            </TouchableOpacity>
          )}
          {!!displayTeam && displayTeam !== 'FA' && basePosition !== 'DEF' && (
            <TouchableOpacity
              style={[styles.followBtn, favorites.teams.includes(String(displayTeam).toUpperCase()) && styles.followBtnOn]}
              onPress={() => toggleFavoriteTeam(String(displayTeam))}
            >
              <Text style={[styles.followText, favorites.teams.includes(String(displayTeam).toUpperCase()) && styles.followTextOn]}>
                {favorites.teams.includes(String(displayTeam).toUpperCase()) ? `★ ${displayTeam}` : `☆ Follow ${displayTeam}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* What to ask the AI depends on where he is in your league: free agent → who to drop,
            on another team → what to trade for him. */}
        {['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(basePosition) && !owner?.mine && (
          owner ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={styles.ownerText}>On {owner.teamName} in your league</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <TouchableOpacity
                  style={styles.dropAskBtn}
                  disabled={isChatTyping}
                  onPress={() => {
                    sendChatMessage(`Who should I trade to ${owner.teamName} to get ${playerName}?`);
                    navigation.navigate('MainTabs', { screen: 'ChatBot' });
                  }}
                >
                  <Text style={styles.dropAskText}>Who should I trade for {shortName}?</Text>
                </TouchableOpacity>
                {!!myTeam && !!activeLeagueId && (
                  <TouchableOpacity style={styles.dropAskBtn} onPress={() => setShowTradeFor(true)}>
                    <Text style={styles.dropAskText}>Build a trade offer</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.dropAskBtn}
              disabled={isChatTyping}
              onPress={() => {
                sendChatMessage(`Who should I drop to pick up ${playerName}?`);
                navigation.navigate('MainTabs', { screen: 'ChatBot' });
              }}
            >
              <Text style={styles.dropAskText}>Who should I drop to add {shortName}?</Text>
            </TouchableOpacity>
          )
        )}
        {!!myTeam && !!activeLeagueId && owner && !owner.mine && (
          <TradeForSheet
            visible={showTradeFor}
            team={myTeam}
            leagueId={activeLeagueId}
            player={{ id: String(player.player_id), name: playerName }}
            onClose={() => setShowTradeFor(false)}
          />
        )}

        <View style={styles.seasonPickerRow}>
          <Text style={styles.experience}>
            {(() => {
            const rookieSeason = getRookieSeason(player, stats);
            if (rookieSeason === null) return '';
            const seasonNumber = getCurrentNFLSeason() - rookieSeason + 1;
            if (seasonNumber <= 1) return 'Experience: Rookie';
            return `Experience: ${seasonNumber} years`;
          })()}
          </Text>
          <View style={styles.metaDot} />
          <Text style={{ color: th.textMuted, marginRight: 8, fontWeight: '700' }}>Season</Text>
          {isRookie ? (
            // Rookies have no previous seasons to pick from
            <View style={styles.seasonPicker}>
              <Text style={styles.seasonPickerText}>{selectedSeason}</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.seasonPicker} onPress={() => setShowSeasonDropdown(s => !s)}>
              <Text style={styles.seasonPickerText}>{selectedSeason} ▾</Text>
            </TouchableOpacity>
          )}
        </View>

        {showSeasonDropdown && !isRookie && (
          <View style={styles.seasonDropdown}>
            {displaySeasons.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.seasonOption, selectedSeason === s && styles.seasonOptionActive]}
                onPress={() => { setSelectedSeason(s); setShowSeasonDropdown(false); }}
              >
                <Text style={[styles.seasonOptionText, selectedSeason === s && styles.seasonOptionTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </View>

      {/* WEEKLY RANGE: floor / typical / ceiling */}
      {['QB', 'RB', 'WR', 'TE', 'K'].includes(basePosition) && range.games >= 3 && statsSeason === selectedSeason && !loadingPlayerStats && (
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.sectionTitle}>Weekly range · {selectedSeason}</Text>
            <Text style={[styles.rangeLabel, { color: range.label === 'safe' ? th.success : range.label === 'boom/bust' ? th.warning : th.primary }]}>
              {range.label.toUpperCase()}
            </Text>
          </View>
          <View style={styles.rangeRow}>
            {[['Bad week', range.floor], ['Typical', range.median], ['Good week', range.ceiling]].map(([label, value]) => (
              <View key={String(label)} style={styles.rangeBox}>
                <Text style={styles.rangeValue}>{Number(value).toFixed(1)}</Text>
                <Text style={styles.rangeCaption}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.statLine}>
            {isCurrentSeason
              ? range.summary
              : range.summary.replace(/last \d+ games/, `${range.games} games in ${selectedSeason}`)}
          </Text>
        </View>
      )}

      {/* INJURY REPORT for the week you're looking at (live this week, saved report for past weeks) */}
      {['QB', 'RB', 'WR', 'TE', 'K'].includes(basePosition) && (
        <InjuryReportCard
          player={player}
          season={selectedSeason}
          week={week}
          weekStats={statsSeason === selectedSeason && week !== undefined ? allWeeksStats[week] : undefined}
        />
      )}

      {/* ========================= */}
      {/* CURRENT WEEK STATS */}
      {/* ========================= */}

      { week !== undefined && !(isRookie && selectedSeason === mostRecentSeasonRef && !loadingPlayerStats && Object.keys(allWeeksStats).length === 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Week {week} Stats
          </Text>

          {loadingPlayerStats ? (
            <Text style={styles.statLine}>Loading Stats...</Text>
          ) : weekStatuses[week] === 'upcoming' ? (
            <Text style={styles.statLine}>Week hasn't occurred yet</Text>
          ) : allWeeksStats[week] ? (() => {
          const currentStats = allWeeksStats[week];
          const teamStatusRaw = currentStats
            ? String(currentStats?.team_status ?? (currentStats as any)?._team_def?.team_status ?? '').toLowerCase().trim()
            : '';
          const isByeWeek = teamStatusRaw.includes('bye');
          const isEliminatedWeek = teamStatusRaw === 'eliminated';
          const posToUse = String(currentStats?.position || player.position || '').toUpperCase().trim();
          const statLines = formatPlayerStats(posToUse, currentStats);
          const isIndividualDefender = isIndividualDefensivePosition(posToUse);
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
              {statLines.length > 0 && !isByeWeek ? (
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
                (() => {
                  if (posToUse === 'K') {
                    const fgMade = Number(currentStats?.fg_made || 0);
                    const fgAtt = Number(currentStats?.fg_att || 0);
                    const patMade = Number(currentStats?.pat_made || 0);
                    const patAtt = Number(currentStats?.pat_att || 0);

                    const fgBuckets: string[] = [];
                    const sum = (k: string) => Number(currentStats?.[k] || 0);
                    const totalFG = sum('fg_made_0_19') + sum('fg_made_20_29') + sum('fg_made_30_39') + sum('fg_made_40_49') + sum('fg_made_50_59') + sum('fg_made_60_');
                    if (sum('fg_made_0_19') > 0) fgBuckets.push(`${sum('fg_made_0_19')} FG (0-19)`);
                    if (sum('fg_made_20_29') > 0) fgBuckets.push(`${sum('fg_made_20_29')} FG (20-29)`);
                    if (sum('fg_made_30_39') > 0) fgBuckets.push(`${sum('fg_made_30_39')} FG (30-39)`);
                    if (sum('fg_made_40_49') > 0) fgBuckets.push(`${sum('fg_made_40_49')} FG (40-49)`);
                    if (sum('fg_made_50_59') > 0) fgBuckets.push(`${sum('fg_made_50_59')} FG (50-59)`);
                    if (sum('fg_made_60_') > 0) fgBuckets.push(`${sum('fg_made_60_')} FG (60+)`);

                    return (
                      <View>
                        {/* show made FG buckets and missed FG distances if present */}
                        {(() => {
                          const missedBuckets: string[] = [];
                          if (sum('fg_missed_0_19') > 0) missedBuckets.push(`${sum('fg_missed_0_19')} (0-19)`);
                          if (sum('fg_missed_20_29') > 0) missedBuckets.push(`${sum('fg_missed_20_29')} (20-29)`);
                          if (sum('fg_missed_30_39') > 0) missedBuckets.push(`${sum('fg_missed_30_39')} (30-39)`);
                          if (sum('fg_missed_40_49') > 0) missedBuckets.push(`${sum('fg_missed_40_49')} (40-49)`);
                          if (sum('fg_missed_50_59') > 0) missedBuckets.push(`${sum('fg_missed_50_59')} (50-59)`);
                          if (sum('fg_missed_60_') > 0) missedBuckets.push(`${sum('fg_missed_60_')} (60+)`);

                          const madePart = fgBuckets.length ? `— ${fgBuckets.join(', ')}` : '';
                          const missedPart = missedBuckets.length ? ` — Missed: ${missedBuckets.join(', ')}` : '';
                          return <Text style={styles.statLine}>FG: {fgMade}/{fgAtt} {madePart}{missedPart}</Text>;
                        })()}
                        <Text style={styles.statLine}>XP: {patMade}/{patAtt}</Text>
                      </View>
                    );
                  }

                  return (
                    <Text style={styles.statLine}>
                      No stats recorded
                    </Text>
                  );
                })()
              )}
            </>
          );
        })() : (
          <Text style={styles.statLine}>
            {weekStatuses[week] === 'in_progress' ? 'Week in progress — no stats yet' : 'No stats available'}
          </Text>
        )}
        </View>
      )}

      {/* ========================= */}
      {/* SEASON STATS */}
      {/* ========================= */}

      {renderSeasonStats()}

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.compareButton}
          onPress={() =>
            navigation.navigate("ComparePlayer", {
              player,
              allWeeksStats,
            })
          }
        >
          <Text style={styles.compareButtonText}>
            Compare Player
          </Text>
        </TouchableOpacity>
      </View>

      {String(player.position || '').toUpperCase().trim() === 'DEF' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Defense Roster</Text>
          <TouchableOpacity
            style={styles.defenseRosterButton}
            onPress={() =>
              navigation.navigate('DefenseRoster', {
                team: displayTeam,
                week: week ?? 1,
              })
            }
          >
            <Text style={styles.defenseRosterButtonText}>View Full Defensive Roster</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={styles.sectionTitle}>News</Text>
          {!!newsUpdatedAt && (
            <Text style={{ fontSize: 12, color: th.textMuted }}>Updated {timeAgo(newsUpdatedAt).toLowerCase()}</Text>
          )}
        </View>
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

      { !(isRookie && selectedSeason === mostRecentSeasonRef && !loadingPlayerStats && Object.keys(allWeeksStats).length === 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Weekly Stats Log
          </Text>

          <ScrollView style={styles.weeklyLogContainer} showsVerticalScrollIndicator={true}>
          {loadingPlayerStats ? (
            <Text style={styles.statLine}>Loading Stats...</Text>
          ) : Array.from({ length: 22 }, (_, i) => i + 1).map((w: number) => {
            const weekStats = allWeeksStats[w];
            const posToUse = String(weekStats?.position || player.position || '').toUpperCase().trim();
            const statLines = weekStats ? formatPlayerStats(posToUse, weekStats) : [];
            const isIndividualDefender = isIndividualDefensivePosition(posToUse);

            // Try to get injury info only from the main row (do not consider team DEF injury status)
            const injuryStatus = weekStats
              ? String(weekStats?.injury_status ?? "").toUpperCase().trim()
              : "";
            const isOut = ["OUT", "IR", "IR-R", "INJURED RESERVE"].includes(injuryStatus);
            const isQuestionable = ["QUESTIONABLE", "DOUBTFUL"].includes(injuryStatus);
            const hasInjury = isOut || isQuestionable;
            const injuryType = weekStats ? (weekStats?.primary_injury || weekStats?.practice_primary_injury || weekStats?.secondary_injury || "") : "";
            const statusLabel = isOut ? "Out" : isQuestionable ? "Questionable" : "";

            // Team status flags (explicit in JSON when available). Prefer team_status from the main row, fall back to team DEF row
            const teamStatusRaw = weekStats
              ? String(weekStats?.team_status ?? (weekStats as any)?._team_def?.team_status ?? '').toLowerCase().trim()
              : '';
            // Be flexible: treat any value containing 'bye' as a bye-week (e.g. 'bye-week', 'bye')
            const isByeWeek = teamStatusRaw.includes('bye');
            const isEliminatedWeek = teamStatusRaw === 'eliminated';

            // If postseason week and no weekStats found, infer bye vs eliminated using schedule info
            const playedWC = Boolean(teamPlayedPostseasonByWeek[19]);
            const playedDiv = Boolean(teamPlayedPostseasonByWeek[20]);
            const isPostseasonWeek = w >= 19 && w <= 22;

            // Special handling:
            // - If team did not play Wild Card (week 19) but did play Divisional (week 20),
            //   then week 19 should be shown as a playoff bye (they were a 1-seed).
            // - If team did not play both WC and Divisional, show eliminated for those rounds.
            // - Otherwise, if a week has no stats and schedule says they didn't play, mark eliminated.
            let postseasonMissingAndEliminated = false;
            let postseasonMissingAndBye = false;

            if (isPostseasonWeek) {
              const playedThisWeek = teamPlayedPostseasonByWeek[w] === true;
              if (!playedThisWeek && (weekStats == null || Object.keys(weekStats).length === 0)) {
                // Wild Card (19) special: if didn't play WC but did play Divisional, it's a bye
                if (w === 19 && !playedWC && playedDiv) {
                  postseasonMissingAndBye = true;
                } else {
                  postseasonMissingAndEliminated = true;
                }
              }
            }

            // effective bye: either explicit bye flag or inferred postseason bye
            const effectiveIsBye = isByeWeek || postseasonMissingAndBye;

            const weekStatus = weekStatuses[w];
            if (weekStatus === 'upcoming') {
              return (
                <View key={w} style={[styles.weekBlock, { backgroundColor: th.surfaceMuted }]}>
                  <Text style={styles.weekTitle}>{getWeekLabel(w)}</Text>
                  {hasInjury && (
                    <Text style={{ fontSize: 16, color: isOut ? "#e53e3e" : "#d69e2e", marginBottom: 4 }}>
                      {statusLabel}: {injuryType || "Unknown injury"}
                    </Text>
                  )}
                  <Text style={styles.statLine}>Week hasn't occurred yet</Text>
                </View>
              );
            }

            return (
              <View
                key={w}
                style={[
                  styles.weekBlock,
                  (isByeWeek || isEliminatedWeek || postseasonMissingAndEliminated)
                    ? { backgroundColor: th.surfaceMuted }
                    : { backgroundColor: getWeekCardBackground(weekStats) },
                ]}
              >
                <Text style={styles.weekTitle}>{getWeekLabel(w)}</Text>

                {/* Show explicit bye / eliminated labels when present in the data */}
                {isByeWeek && (
                  <Text style={styles.byeEliminatedText}>
                    Bye Week
                  </Text>
                )}

                {isEliminatedWeek && (
                  <Text style={styles.byeEliminatedText}>
                    Eliminated
                  </Text>
                )}

                {/* If postseason and no data row, show inferred message from schedule */}
                {postseasonMissingAndBye && (
                  <Text style={styles.byeEliminatedText}>
                    Playoff bye (did not play this round)
                  </Text>
                )}

                {postseasonMissingAndEliminated && (
                  <Text style={styles.byeEliminatedText}>
                    Team eliminated (did not play this round)
                  </Text>
                )}

                {/* Show injury info if applicable */}
                {hasInjury && (
                  <Text style={{ fontSize: 16, color: isOut ? "#e53e3e" : "#d69e2e", marginBottom: 4 }}>
                    {statusLabel}: {injuryType || "Unknown injury"}
                  </Text>
                )}

                {/* Show fantasy points if stats exist and NOT a bye/eliminated week */}
                {weekStats && !isIndividualDefender && !effectiveIsBye && !isEliminatedWeek && !postseasonMissingAndEliminated && (
                  <Text style={styles.weekFantasyPoints}>
                    {weekStats.fantasy_points_ppr ? Number(weekStats.fantasy_points_ppr).toFixed(2) : '0.00'} pts
                  </Text>
                )}

                {/* Show stats or message */}
                {statLines.length > 0 && !effectiveIsBye && !isEliminatedWeek && !postseasonMissingAndEliminated ? (
                  statLines.map((line: string, index: number) => (
                    <Text key={index} style={styles.statLine}>
                      {line}
                    </Text>
                  ))
                ) : hasInjury ? (
                  // Injury info already shown above, no additional message needed
                  null
                ) : (postseasonMissingAndEliminated || isEliminatedWeek || effectiveIsBye) ? (
                  // Already showed bye/eliminated info above; no extra message
                  null
                ) : (
                  (() => {
                    const pos = posToUse;
                    if (pos === 'K') {
                      const sum = (k: string) => Number(weekStats?.[k] || 0);
                      const fgMade = sum('fg_made_0_19') + sum('fg_made_20_29') + sum('fg_made_30_39') + sum('fg_made_40_49') + sum('fg_made_50_59') + sum('fg_made_60_');
                      const fgAtt = Number(weekStats?.fg_att || 0) || (fgMade > 0 ? fgMade : 0);
                      const patMade = Number(weekStats?.pat_made || 0);
                      const patAtt = Number(weekStats?.pat_att || 0);
                      const fgBuckets: string[] = [];
                      if (sum('fg_made_0_19') > 0) fgBuckets.push(`${sum('fg_made_0_19')} (0-19)`);
                      if (sum('fg_made_20_29') > 0) fgBuckets.push(`${sum('fg_made_20_29')} (20-29)`);
                      if (sum('fg_made_30_39') > 0) fgBuckets.push(`${sum('fg_made_30_39')} (30-39)`);
                      if (sum('fg_made_40_49') > 0) fgBuckets.push(`${sum('fg_made_40_49')} (40-49)`);
                      if (sum('fg_made_50_59') > 0) fgBuckets.push(`${sum('fg_made_50_59')} (50-59)`);
                      if (sum('fg_made_60_') > 0) fgBuckets.push(`${sum('fg_made_60_')} (60+)`);

                        return (
                          <View>
                            {(() => {
                              const missedBuckets: string[] = [];
                              if (sum('fg_missed_0_19') > 0) missedBuckets.push(`${sum('fg_missed_0_19')} (0-19)`);
                              if (sum('fg_missed_20_29') > 0) missedBuckets.push(`${sum('fg_missed_20_29')} (20-29)`);
                              if (sum('fg_missed_30_39') > 0) missedBuckets.push(`${sum('fg_missed_30_39')} (30-39)`);
                              if (sum('fg_missed_40_49') > 0) missedBuckets.push(`${sum('fg_missed_40_49')} (40-49)`);
                              if (sum('fg_missed_50_59') > 0) missedBuckets.push(`${sum('fg_missed_50_59')} (50-59)`);
                              if (sum('fg_missed_60_') > 0) missedBuckets.push(`${sum('fg_missed_60_')} (60+)`);

                              const madePart = fgBuckets.length ? ` — ${fgBuckets.join(', ')}` : '';
                              const missedPart = missedBuckets.length ? ` — Missed: ${missedBuckets.join(', ')}` : '';
                              return <Text style={styles.statLine}>FG: {fgMade}/{fgAtt}{madePart}{missedPart}</Text>;
                            })()}
                            <Text style={styles.statLine}>XP: {patMade}/{patAtt}</Text>
                          </View>
                        );
                    }
                    return (
                      <Text style={styles.statLine}>
                        {weekStatus === 'in_progress' ? 'Week in progress — no stats yet' : 'No stats recorded'}
                      </Text>
                    );
                  })()
                )}

                {/* Show team defense stats for this week when available (only when viewing a team DEF) */}
                {String(player.position || '').toUpperCase().trim() === 'DEF' && weekStats && (weekStats as any)._team_def && !effectiveIsBye && !isEliminatedWeek && !postseasonMissingAndEliminated ? (() => {
                  const teamDef = (weekStats as any)._team_def;
                  // Avoid duplicating when the main weekStats is the team DEF row itself
                  if (String((weekStats as any).player_id || '') === String(teamDef?.player_id || '')) return null;
                  const defLines = formatPlayerStats('DEF', teamDef);
                  return (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 4 }}>Team Defense</Text>
                      {defLines.map((line: string, idx: number) => (
                        <Text key={`def-${w}-${idx}`} style={styles.statLine}>{line}</Text>
                      ))}
                    </View>
                  );
                })() : null}
              </View>
            );
          })}
          </ScrollView>
        </View>
      )}

    </ScrollView>
  );
}

const makeStyles = (th: Palette) => ({

  container: {
    flex: 1,
    backgroundColor: th.background
  },

  header: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: th.border,
    backgroundColor: th.surface,
  },

  headshotRing: {
    borderWidth: 3,
    borderRadius: 60,
    padding: 3,
    marginBottom: 10,
  },

  headshot: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: th.surfaceMuted,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  posPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  posPillText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  rankRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    alignSelf: 'stretch',
  },
  rankChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: th.surfaceMuted,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  rankValue: {
    color: th.text,
    fontSize: 17,
    fontWeight: '800',
  },
  rankCaption: {
    color: th.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: th.textSubtle,
    marginHorizontal: 10,
  },

  dropAskBtn: {
    marginTop: 10,
    backgroundColor: th.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  dropAskText: {
    color: th.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  playerName: { color: th.text,
    fontSize: 26,
    fontWeight: "800",
    textAlign: 'center',
  },

  playerInfo: {
    fontSize: 15,
    fontWeight: '700',
    color: th.textMuted,
  },

  experience: {
    fontSize: 13,
    color: th.textMuted,
    fontWeight: '600',
  },
  seasonPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: th.border,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  seasonPicker: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: th.border,
    backgroundColor: th.surface
  },
  seasonPickerText: {
    fontSize: 14,
    fontWeight: '700',
    color: th.text
  },
  seasonDropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: 8,
    backgroundColor: th.surface,
    paddingVertical: 6,
    marginHorizontal: 20,
  },
  seasonOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  seasonOptionActive: {
    backgroundColor: th.primarySoft,
  },
  seasonOptionText: {
    fontSize: 14,
    color: th.text,
  },
  seasonOptionTextActive: {
    color: th.text,
    fontWeight: '800'
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
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: th.border,
    backgroundColor: th.surface,
  },

  sectionTitle: { color: th.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10
  },

  statLine: { color: th.text,
    fontSize: 16,
    marginBottom: 6
  },

  weekBlock: {
    marginBottom: 10,
    padding: 12,
    backgroundColor: th.surfaceMuted,
    borderRadius: 12
  },

  weekTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    color: th.text
  },

  weeklyLogContainer: {
    height: 500, // Fixed height for scrollable log
    borderRadius: 12,
  },

  weekFantasyPoints: {
    fontSize: 16,
    fontWeight: "700",
    color: th.primary,
    marginTop: 8
  },

  fantasyPoints: {
    fontSize: 28,
    fontWeight: "800",
    color: th.primary
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
    backgroundColor: th.surfaceMuted,
    borderWidth: 1,
    borderColor: th.border,
  },

  seasonScopeButtonActive: {
    backgroundColor: th.primary,
    borderColor: th.primary,
  },

  seasonScopeText: {
    fontSize: 12,
    fontWeight: '700',
    color: th.text,
  },

  seasonScopeTextActive: {
    color: '#fff',
  },

  disclaimerText: {
    fontSize: 13,
    color: th.textMuted,
    marginTop: 6,
    marginBottom: 8,
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
    backgroundColor: th.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: th.border,
  },

  seasonValue: {
    fontSize: 18,
    fontWeight: '700',
    color: th.text,
  },

  seasonLabel: {
    fontSize: 11,
    color: th.textMuted,
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
    backgroundColor: th.surfaceMuted,
    borderWidth: 1,
    borderColor: th.border,
  },

  newsTabButtonActive: {
    backgroundColor: th.primary,
    borderColor: th.primary,
  },

  newsTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: th.text,
  },

  newsTabTextActive: {
    color: '#fff',
  },

  newsCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.border,
    backgroundColor: th.surfaceMuted,
    marginBottom: 10,
  },

  rangeLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  ownerText: { fontSize: 12, fontWeight: '700', color: th.textMuted },
  followRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  followBtn: { borderWidth: 1, borderColor: th.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: th.surface },
  followBtnOn: { backgroundColor: th.warningSoft, borderColor: th.warning },
  followText: { fontSize: 13, fontWeight: '700', color: th.text },
  followTextOn: { color: th.warning },
  rangeRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  rangeBox: { flex: 1, backgroundColor: th.surfaceMuted, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rangeValue: { fontSize: 20, fontWeight: '800', color: th.text },
  rangeCaption: { fontSize: 11, color: th.textMuted, marginTop: 2 },

  newsThumb: {
    width: 76,
    height: 76,
    borderRadius: 8,
    backgroundColor: th.surface,
  },

  newsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: th.text,
    marginBottom: 6,
  },

  newsSummary: {
    fontSize: 13,
    color: th.textMuted,
    marginBottom: 8,
  },

  newsMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  newsMetaText: {
    fontSize: 12,
    color: th.textMuted,
  },

  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },

  impactBadgeText: { color: th.text,
    fontSize: 11,
    fontWeight: '700',
  },

  defenseRosterButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: th.primarySoft,
    borderWidth: 1,
    borderColor: th.border,
    alignItems: 'center',
  },

  defenseRosterButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: th.primary,
  },
  byeEliminatedText: {
    fontSize: 18,
    fontWeight: '700',
    color: th.textMuted,
    marginBottom: 6,
  },
  compareButton: {
    backgroundColor: th.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },

  compareButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },

});