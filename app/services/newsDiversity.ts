// app/services/newsDiversity.ts
// Pick a varied set of news articles: newest first, no near-duplicate headlines, and
// prefer new categories (injury, transaction, performance...) and new players.

export type NewsItem = {
  title: string;
  link?: string;
  published?: string;
  player?: string;
  category?: string;
  impact?: string;
  summary?: string;
  source?: string;
  // Real article address and its cover image (filled in by nfl-data's news job)
  url?: string;
  image?: string;
  // The link is a video (nfl-data marks these; the image is the video's cover)
  video?: boolean;
};

const VIDEO_LINK = /youtu\.be\/|youtube\.com\/|vimeo\.com\/|\/videos?\/|\/watch\/|espn\.com\/video\/|nfl\.com\/videos\//i;

/** Is this article a video? (marked by nfl-data, or a known video link) */
export const isVideoArticle = (a: { video?: boolean; url?: string; link?: string }) =>
  !!a.video || VIDEO_LINK.test(String(a.url || a.link || ''));

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'vs', 'at', 'is', 'his', 'he', 'as', 'after', 'from', 'by', 'be', 'will', 'week', 'nfl', 's']);

const words = (text: string, ignore: Set<string>) =>
  new Set(
    String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOPWORDS.has(w) && !ignore.has(w))
  );

// Word overlap between two headlines, ignoring the names of the players they're about.
export function titleSimilarity(a: NewsItem, b: NewsItem): number {
  const ignore = new Set(`${a.player ?? ''} ${b.player ?? ''}`.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/));
  const wa = words(a.title, ignore);
  const wb = words(b.title, ignore);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  wa.forEach(w => wb.has(w) && shared++);
  return shared / (wa.size + wb.size - shared);
}

export function selectDiverseNews(
  articles: NewsItem[],
  n = 3,
  { maxSimilarity = 0.45, onePerPlayer = false }: { maxSimilarity?: number; onePerPlayer?: boolean } = {}
): NewsItem[] {
  const sorted = [...articles].sort((a, b) => String(b.published ?? '').localeCompare(String(a.published ?? '')));
  const picked: NewsItem[] = [];
  const tooSimilar = (a: NewsItem) => picked.some(p => (p.link && p.link === a.link) || titleSimilarity(p, a) >= maxSimilarity);

  // Pass 1 wants a new category (and a new player for team news); pass 2 fills remaining slots.
  for (const pass of [1, 2]) {
    for (const a of sorted) {
      if (picked.length >= n) break;
      if (picked.includes(a) || tooSimilar(a)) continue;
      if (onePerPlayer && picked.some(p => p.player === a.player)) continue;
      if (pass === 1 && picked.some(p => (p.category ?? '') === (a.category ?? ''))) continue;
      picked.push(a);
    }
  }
  return picked;
}
