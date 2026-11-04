// app/components/TradeGradeCard.tsx
// One graded trade: letter grade, verdict, how both lineups change, notes, and (when the
// offer isn't good for you) counter-offers with a message you can send back.

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { askAboutOffer, counterMessage, GRADE_COLORS, type TradeGrade, askAboutProposal, proposalMessage } from '../services/tradeGrader';
import { radius, type Palette } from '../theme';

export default function TradeGradeCard({
  r,
  partnerName,
  onAskAI,
}: {
  r: TradeGrade;
  partnerName: string;
  onAskAI: (question: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [openCounter, setOpenCounter] = useState<number | null>(null);
  const tone = colors[GRADE_COLORS[r.grade]];
  const names = (list: { name: string }[]) => list.map(p => p.name);

  const Metric = ({ label, value, color }: { label: string; value: string; color: string }) => (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.result}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.gradeBadge, { backgroundColor: tone }]}>
          <Text style={styles.gradeText}>{r.grade}</Text>
        </View>
        <Text style={[styles.headline, { flex: 1 }]}>{r.headline}</Text>
      </View>
      <Text style={styles.sides}>
        You give <Text style={styles.bold}>{names(r.idea.give).join(', ') || 'nothing'}</Text> · you get{' '}
        <Text style={styles.bold}>{names(r.idea.get).join(', ') || 'nothing'}</Text>
      </Text>
      <View style={styles.metrics}>
        <Metric label="Your lineup" value={`${r.idea.myGain >= 0 ? '+' : ''}${r.idea.myGain.toFixed(1)} pts/wk`} color={r.idea.myGain >= 0 ? colors.success : colors.danger} />
        <Metric label="Their lineup" value={`${r.idea.theirGain >= 0 ? '+' : ''}${r.idea.theirGain.toFixed(1)} pts/wk`} color={colors.text} />
        <Metric label="Value balance" value={`${Math.round(r.idea.fairness * 100)}%`} color={colors.text} />
      </View>
      {r.idea.reasons.concat(r.notes).map((line, i) => (
        <Text key={i} style={styles.reason}>• {line}</Text>
      ))}

      {(r.counters?.length ?? 0) > 0 && (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={styles.section}>
            {r.mode === 'send'
              ? r.idea.myGain >= 0.5
                ? 'EDITS SO THEY SAY YES (STILL GOOD FOR YOU)'
                : 'BETTER VERSIONS TO SEND'
              : 'COUNTER-OFFERS THAT WORK BETTER FOR YOU'}
          </Text>
          {r.counters!.map((c, i) => (
            <Pressable key={i} style={styles.counter} onPress={() => setOpenCounter(openCounter === i ? null : i)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.bold, { flex: 1 }]}>{c.summary}</Text>
                <Text style={{ color: colors.success, fontWeight: '800' }}>+{c.idea.myGain.toFixed(1)}</Text>
              </View>
              <Text style={styles.counterMeta}>
                You give {names(c.idea.give).join(', ')} · you get {names(c.idea.get).join(', ')} · their lineup{' '}
                {c.idea.theirGain >= 0 ? '+' : ''}{c.idea.theirGain.toFixed(1)}
              </Text>
              {openCounter === i && (
                <View style={styles.message}>
                  <Text style={styles.messageLabel}>Message to send {partnerName} (tap and hold to copy):</Text>
                  <Text style={styles.messageText} selectable>
                    {r.mode === 'send' ? proposalMessage(partnerName, c.idea) : counterMessage(partnerName, c)}
                  </Text>
                  <Text style={styles.counterMeta}>
                    {r.mode === 'send'
                      ? 'In Sleeper, open their team, tap "Propose trade", then pick these players.'
                      : 'In Sleeper, open the offer and tap "Counter", then pick these players.'}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
      {r.verdict === 'send' && (
        <View style={styles.message}>
          <Text style={styles.messageLabel}>Message to send {partnerName} (tap and hold to copy):</Text>
          <Text style={styles.messageText} selectable>{proposalMessage(partnerName, r.idea)}</Text>
        </View>
      )}
      {!['accept', 'send'].includes(r.verdict) && (r.counters?.length ?? 0) === 0 && (
        <Text style={styles.counterMeta}>
          {r.mode === 'send'
            ? 'No small edit makes this work for both teams. Try different players.'
            : 'No counter-offer with their players helps your lineup by at least a point a week.'}
        </Text>
      )}

      <Pressable
        style={styles.askBtn}
        onPress={() =>
          onAskAI(
            r.mode === 'send'
              ? askAboutProposal(partnerName, names(r.idea.give), names(r.idea.get))
              : askAboutOffer(partnerName, names(r.idea.give), names(r.idea.get))
          )
        }
      >
        <Ionicons name="sparkles" size={14} color={colors.primary} />
        <Text style={styles.askText}>{r.mode === 'send' ? 'Ask the AI: send it or change it?' : 'Ask the AI to explain this trade'}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  result: { backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 12, gap: 6 },
  gradeBadge: { width: 46, height: 46, borderRadius: 23, alignItems: 'center' as const, justifyContent: 'center' as const },
  gradeText: { color: '#fff', fontSize: 22, fontWeight: '900' as const },
  headline: { fontSize: 14, fontWeight: '700' as const, color: c.text, lineHeight: 19 },
  sides: { fontSize: 13, color: c.text, lineHeight: 18 },
  bold: { fontWeight: '800' as const, color: c.text },
  metrics: { flexDirection: 'row' as const, gap: 6 },
  metric: { flex: 1, backgroundColor: c.surface, borderRadius: radius.sm, padding: 8, alignItems: 'center' as const },
  metricValue: { fontSize: 15, fontWeight: '800' as const },
  metricLabel: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  reason: { fontSize: 12, color: c.text, lineHeight: 17 },
  section: { fontSize: 11, fontWeight: '800' as const, color: c.textSubtle, letterSpacing: 0.8 },
  counter: { backgroundColor: c.surface, borderRadius: radius.sm, padding: 10, gap: 4, borderWidth: 1, borderColor: c.border },
  counterMeta: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
  message: { gap: 4, marginTop: 4 },
  messageLabel: { fontSize: 11, fontWeight: '700' as const, color: c.textMuted },
  messageText: { fontSize: 13, color: c.text, backgroundColor: c.surfaceMuted, borderRadius: radius.sm, padding: 8, lineHeight: 18 },
  askBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingTop: 4 },
  askText: { color: c.primary, fontWeight: '700' as const, fontSize: 13 },
});
