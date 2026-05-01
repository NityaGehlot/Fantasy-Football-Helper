// screens/PlayerDetailsScreen.tsx

import React, { useEffect, useState } from "react";
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
import { getPlayers } from '../services/sleeperAPI';

type NewsArticle = {
  title: string;
  summary?: string;
  link?: string;
  published?: string;
  player?: string;
  impact?: string;
};

export default function PlayerDetailsScreen({ route }: any) {
  const { player, stats, week, fantasyPoints } = route.params;
  const displayTeam = String(stats?.team || player?.team || 'N/A');

  const [allWeeksStats, setAllWeeksStats] = useState<any>({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingNews, setLoadingNews] = useState(true);
  const [newsTab, setNewsTab] = useState<'player' | 'team'>('player');
  const [playerNews, setPlayerNews] = useState<NewsArticle[]>([]);
  const [teamNews, setTeamNews] = useState<NewsArticle[]>([]);

  const NEWS_BASE_URL = "https://raw.githubusercontent.com/NityaGehlot/nfl-data/main/data";

  const normalizeName = (value?: string) => String(value || "").trim().toLowerCase();

  const getNewsFileKey = (position?: string) => {
    const pos = String(position || '').toUpperCase().trim();
    if (pos === 'QB') return 'qb';
    if (pos === 'RB') return 'rb';
    if (pos === 'WR') return 'wr';
    if (pos === 'TE') return 'te';
    if (pos === 'K') return 'k';
    return null;
  };

  useEffect(() => {
    const fetchAllWeeks = async () => {
      setLoadingStats(true);
      try {
        const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
        const promises = weeks.map(w => getPlayerStatsByWeek(w));
        const results = await Promise.all(promises);

        const statsMap: any = {};
        results.forEach((data, index) => {
          const w = index + 1;
          const playerStats = getPlayerNFLStats(player.player_id, w, data);
          if (playerStats && Object.keys(playerStats).length > 0) {
            statsMap[w] = playerStats;
          }
        });
        setAllWeeksStats(statsMap);
      } catch (err) {
        console.error('Error fetching player stats:', err);
      } finally {
        setLoadingStats(false);
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
          const sleeperPlayers = await getPlayers();
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

    // PLAYER ID MATCH FIRST
    const idMatch = weekMatches.find(
      (p: any) => String(p.player_id) === String(playerId)
    );
    if (idMatch) return idMatch;

    // FALLBACK: NAME MATCH
    const fullName = sleeperPlayer.full_name?.toLowerCase();
    if (!fullName) return null;

    const nameMatch = weekMatches.find((p: any) => {
      const jsonName = p.player_name?.toLowerCase();
      if (!jsonName) return false;
      return (
        (jsonName.includes(fullName) || fullName.includes(jsonName)) &&
        p.position === sleeperPlayer.position
      );
    });

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
    switch (pos) {
      case "QB": return "#ff6b6b";
      case "RB": return "#2ec4b6";
      case "WR": return "#48b0f7";
      case "TE": return "#ffbe0b";
      case "K": return "#9d4edd";
      case "DEF": return "#777";
      default: return "#aaa";
    }
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

    return lines;
  };

  // =========================
  // SEASON TOTALS
  // =========================
  const computeSeasonStats = () => {
    const weeks = Object.values(allWeeksStats);
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
    return null;
  };

  const renderSeasonStats = () => {
    const pos = String(player.position).trim().toUpperCase();
    const s = computeSeasonStats();
    if (!s) return null;

    const rows: { label: string; value: string }[] = [];

    rows.push({ label: 'Games', value: String(s.games) });
    rows.push({ label: 'Fantasy Pts', value: Number(s.fantasy_points_ppr).toFixed(1) });

    if (pos === 'QB') {
      rows.push({ label: 'Completions', value: `${s.completions}/${s.attempts}` });
      rows.push({ label: 'Pass Yards', value: String(s.passing_yards) });
      rows.push({ label: 'Pass TDs', value: String(s.passing_tds) });
      rows.push({ label: 'INTs', value: String(s.passing_interceptions) });
      if (s.carries > 0) {
        rows.push({ label: 'Carries', value: String(s.carries) });
        rows.push({ label: 'Rush Yards', value: String(s.rushing_yards) });
        rows.push({ label: 'Rush TDs', value: String(s.rushing_tds) });
      }
    } else if (pos === 'RB') {
      rows.push({ label: 'Carries', value: String(s.carries) });
      rows.push({ label: 'Rush Yards', value: String(s.rushing_yards) });
      rows.push({ label: 'Rush TDs', value: String(s.rushing_tds) });
      rows.push({ label: 'Receptions', value: `${s.receptions}/${s.targets}` });
      rows.push({ label: 'Rec Yards', value: String(s.receiving_yards) });
      rows.push({ label: 'Rec TDs', value: String(s.receiving_tds) });
    } else if (pos === 'WR' || pos === 'TE') {
      rows.push({ label: 'Receptions', value: `${s.receptions}/${s.targets}` });
      rows.push({ label: 'Rec Yards', value: String(s.receiving_yards) });
      rows.push({ label: 'Rec TDs', value: String(s.receiving_tds) });
      if (s.carries > 0) {
        rows.push({ label: 'Carries', value: String(s.carries) });
        rows.push({ label: 'Rush Yards', value: String(s.rushing_yards) });
      }
    } else if (pos === 'K') {
      rows.push({ label: 'FG Made/Att', value: `${s.fg_made}/${s.fg_att}` });
      rows.push({ label: 'XP Made/Att', value: `${s.pat_made}/${s.pat_att}` });
    } else if (pos === 'DEF') {
      rows.push({ label: 'Sacks', value: String(s.def_sacks) });
      rows.push({ label: 'INTs', value: String(s.def_interceptions) });
      rows.push({ label: 'Fumbles Forced', value: String(s.def_fumbles_forced) });
      rows.push({ label: 'Fumbles Rec', value: String(s.fumbles_recovered) });
      rows.push({ label: 'TDs', value: String(s.def_tds) });
      rows.push({ label: 'Safeties', value: String(s.def_safeties) });
      rows.push({ label: 'Pts Allowed', value: String(s.points_allowed) });
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Season Stats</Text>
        <View style={styles.seasonGrid}>
          {rows.map((row) => (
            <View key={row.label} style={styles.seasonCell}>
              <Text style={styles.seasonValue}>{row.value}</Text>
              <Text style={styles.seasonLabel}>{row.label}</Text>
            </View>
          ))}
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

        {allWeeksStats[week] ? (() => {
          const currentStats = allWeeksStats[week];
          const statLines = formatPlayerStats(player.position, currentStats);
          return (
            <>
              {statLines.length > 0 ? (
                statLines.map((line: string, index: number) => (
                  <Text key={index} style={styles.statLine}>
                    {line}
                  </Text>
                ))
              ) : (
                <Text style={styles.statLine}>
                  No stats recorded yet
                </Text>
              )}
              <Text style={styles.fantasyPoints}>
                {currentStats.fantasy_points_ppr ? Number(currentStats.fantasy_points_ppr).toFixed(2) : '0.00'} pts
              </Text>
            </>
          );
        })() : (
          <Text style={styles.statLine}>
            {loadingStats ? 'Loading...' : 'No stats recorded yet'}
          </Text>
        )}
      </View>

      {/* ========================= */}
      {/* SEASON STATS */}
      {/* ========================= */}

      {loadingStats ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Season Stats</Text>
          <Text style={styles.statLine}>Loading...</Text>
        </View>
      ) : renderSeasonStats() ?? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Season Stats</Text>
          <Text style={styles.statLine}>No stats recorded yet</Text>
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
          {Object.keys(allWeeksStats).length > 0 ? (
            Object.keys(allWeeksStats).sort((a, b) => Number(a) - Number(b)).map((w: string) => {
              const weekStats = allWeeksStats[w];
              const statLines = formatPlayerStats(player.position, weekStats);
              const injuryStatus = String(weekStats?.injury_status ?? "").toUpperCase().trim();
              const isOut = ["OUT", "IR", "IR-R", "INJURED RESERVE"].includes(injuryStatus);
              const isQuestionable = ["QUESTIONABLE", "DOUBTFUL"].includes(injuryStatus);
              const hasInjury = isOut || isQuestionable;
              const injuryType = weekStats?.primary_injury || weekStats?.practice_primary_injury || weekStats?.secondary_injury || "";
              const statusLabel = isOut ? "Out" : isQuestionable ? "Questionable" : "";

              return (
                <View key={w} style={styles.weekBlock}>
                  <Text style={styles.weekTitle}>Week {w}</Text>
                  {hasInjury && (
                    <Text style={{ fontSize: 16, color: isOut ? "#e53e3e" : "#d69e2e", marginBottom: 4 }}>
                      {statusLabel}: {injuryType || "Unknown injury"}
                    </Text>
                  )}
                  <Text style={styles.weekFantasyPoints}>
                    {weekStats.fantasy_points_ppr ? Number(weekStats.fantasy_points_ppr).toFixed(2) : '0.00'} pts
                  </Text>
                  {statLines.length > 0 ? (
                    statLines.map((line: string, index: number) => (
                      <Text key={index} style={styles.statLine}>
                        {line}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.statLine}>
                      No stats recorded
                    </Text>
                  )}
                </View>
              );
            })
          ) : (
            <Text style={styles.statLine}>
              {loadingStats ? 'Loading...' : 'No stats recorded yet'}
            </Text>
          )}
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

});