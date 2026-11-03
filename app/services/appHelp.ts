// app/services/appHelp.ts
// Help assistant: matches your question to guide topics, then asks the backend's AI to answer
// from those topics. If the AI isn't running, the matching guide text is the answer.

import { getApiBaseUrl } from './apiBaseUrl';
import { GUIDE, matchGuide, type GuideTopic } from './appGuide';

export type HelpAnswer = { text: string; topics: GuideTopic[]; fromAI: boolean };

export async function askAppHelp(question: string): Promise<HelpAnswer> {
  const topics = matchGuide(question);
  const fallback = topics.length
    ? topics[0].answer
    : `I'm not sure about that one. I can explain: ${GUIDE.slice(0, 6).map(t => t.title.toLowerCase()).join(', ')}, and more.`;
  try {
    const res = await fetch(`${getApiBaseUrl()}/app-help`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, topics: topics.map(t => ({ title: t.title, answer: t.answer })) }),
    });
    const data = res.ok ? await res.json() : null;
    if (data?.reply) return { text: String(data.reply), topics, fromAI: true };
  } catch {
    // backend not reachable
  }
  return { text: fallback, topics, fromAI: false };
}
