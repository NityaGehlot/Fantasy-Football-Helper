// app/components/InjuryReportCard.tsx
// Current injury designation plus this week's day-by-day practice report, laid out like the
// injury reports teams publish (Wed / Thu / Fri participation and game status).

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getInjuryFile } from '../services/injuryService';
import { getNewsFile } from '../services/newsService';
import { latestInjuryNews } from '../services/injuryNews';
import type { NewsItem } from '../services/newsDiversity';
import { currentInjury, indexInjuries, injuryLabel, isOutStatus, practiceTable, type InjuryFile } from '../services/injuryFormat';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { radius, type Palette } from '../theme';

export default function InjuryReportCard({ player }: { player: any }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [file, setFile] = useState<InjuryFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<NewsItem | null>(null);

  // The newest injury/practice headline about him (news often comes before official reports).
  useEffect(() => {
    let cancelled = false;
    const key = String(player?.position_for_FFHelper || player?.position || '').toLowerCase();
    if (!key) return;
    getNewsFile(key)
      .then(items => !cancelled && setNews(latestInjuryNews(items, player?.full_name)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [player?.full_name, player?.position]);

  useEffect(() => {
    let cancelled = false;
    getInjuryFile().then(f => {
      if (!cancelled) {
        setFile(f);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  const { status, injury, record } = currentInjury(indexInjuries(file), player);
  // The injury file's own headline (updated every few hours) wins over the one found here.
  const latest = record?.latest_news ?? news;
  const practiceNews = record?.latest_news?.practice;
  const rows = practiceTable(record?.history);
  const out = isOutStatus(status);
  const tone = !status ? colors.success : out ? colors.danger : colors.warning;
  const toneSoft = !status ? colors.successSoft : out ? colors.dangerSoft : colors.warningSoft;
  const pillColor = (p: string) => (p === 'DNP' ? colors.danger : p === 'LP' ? colors.warning : p === 'FP' ? colors.success : colors.textSubtle);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Injury report</Text>
        {file?.week ? <Text style={styles.week}>Week {file.week}</Text> : null}
      </View>

      <View style={[styles.statusBox, { backgroundColor: toneSoft }]}>
        <Ionicons name={!status ? 'checkmark-circle' : out ? 'medkit' : 'alert-circle'} size={18} color={tone} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusText, { color: tone }]}>{status ? injuryLabel(status) || status : 'No injury designation'}</Text>
          {!!injury && <Text style={styles.injuryText}>{injury}</Text>}
          {practiceNews === 'DNP' && (
            <Text style={[styles.newsFlag, { color: colors.danger }]}>
              Latest report: not practicing ({[record?.latest_news?.source, record?.latest_news?.published].filter(Boolean).join(', ')})
            </Text>
          )}
          {practiceNews === 'LP' && (
            <Text style={[styles.newsFlag, { color: colors.warning }]}>Latest report: limited in practice</Text>
          )}
          {practiceNews === 'FP' && (
            <Text style={[styles.newsFlag, { color: colors.success }]}>Latest report: back at full practice</Text>
          )}
          {!!record?.status_note && <Text style={styles.notes}>{record.status_note}</Text>}
          {!!record?.notes && <Text style={styles.notes}>{record.notes}</Text>}
        </View>
      </View>

      {!!latest && (
        <View style={[styles.newsBox, { borderLeftColor: latest.impact === 'positive' || latest.impact === 'injury_return' ? colors.success : colors.danger }]}>
          <Text style={styles.newsLabel}>LATEST INJURY NEWS · {[latest.source, latest.published].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.newsTitle}>{latest.title}</Text>
          {!!latest.summary && <Text style={styles.notes}>{latest.summary}</Text>}
        </View>
      )}

      {rows.length > 0 && (
        <View style={styles.table}>
          <View style={[styles.tr, styles.thRow]}>
            <Text style={[styles.th, { flex: 1.1 }]}>Day</Text>
            <Text style={[styles.th, { flex: 1.6 }]}>Practice</Text>
            <Text style={[styles.th, { flex: 1.4 }]}>Status</Text>
          </View>
          {rows.map(r => (
            <View key={r.date} style={styles.tr}>
              <Text style={[styles.td, { flex: 1.1, fontWeight: '700' }]}>{r.day}</Text>
              <View style={{ flex: 1.6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {!!r.practice && <View style={[styles.dot, { backgroundColor: pillColor(r.practice) }]} />}
                <Text style={styles.td}>{r.practiceLabel}</Text>
              </View>
              <Text style={[styles.td, { flex: 1.4 }]}>{r.status}</Text>
            </View>
          ))}
          <Text style={styles.legend}>
            Full = full practice · Limited = partial · Did not practice = held out · No report = no official report that day
            (teams publish them Wednesday–Friday for Sunday games). "(last game)" = still his status from last week.
          </Text>
        </View>
      )}
      {status && rows.length === 0 && (
        <Text style={styles.legend}>Practice reports show up here once teams publish them (usually Wednesday–Friday).</Text>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: c.border },
  headerRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800' as const, color: c.text },
  week: { fontSize: 12, color: c.textMuted, fontWeight: '600' as const },
  statusBox: { flexDirection: 'row' as const, gap: 10, alignItems: 'flex-start' as const, borderRadius: radius.md, padding: 10 },
  statusText: { fontSize: 15, fontWeight: '800' as const },
  injuryText: { color: c.text, fontSize: 13, marginTop: 2 },
  notes: { color: c.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  table: { marginTop: 12, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden' as const },
  tr: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: c.border },
  thRow: { backgroundColor: c.surfaceMuted, borderTopWidth: 0 },
  th: { fontSize: 11, fontWeight: '800' as const, color: c.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  td: { fontSize: 13, color: c.text },
  dot: { width: 8, height: 8, borderRadius: 4 },
  newsFlag: { fontSize: 13, fontWeight: '800' as const, marginTop: 4 },
  newsBox: { marginTop: 10, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 2, gap: 2 },
  newsLabel: { fontSize: 10, fontWeight: '800' as const, color: c.textMuted, letterSpacing: 0.5 },
  newsTitle: { fontSize: 13, fontWeight: '700' as const, color: c.text },
  legend: { fontSize: 11, color: c.textSubtle, padding: 10, lineHeight: 16 },
});
