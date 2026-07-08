import { XMLParser } from 'fast-xml-parser';

// Both feeds are fetched at build time; the site rebuilds hourly via Actions.
const PODCAST_FEED = 'https://feeds.buzzsprout.com/2570635.rss';
// substack.com host is stable regardless of which custom domain the
// publication uses, so the build never breaks during domain moves.
const DAILY_FEED = 'https://semidoped.substack.com/feed';

export const LINKS = {
  podcast: 'https://semidoped.fm',
  daily: 'https://daily.semidoped.com',
  youtube: 'https://www.youtube.com/@SemiDoped',
  apple: 'https://podcasts.apple.com/podcast/id1866707196',
  spotify: 'https://open.spotify.com/show/0Uuu3s1Nw09f6Xmg24rCZm',
  amazon: 'https://music.amazon.com/podcasts/32c1c172-83f4-4eb1-843f-5fbea4789ac6',
  rss: 'https://feeds.buzzsprout.com/2570635.rss',
  x: 'https://x.com/semidoped',
};

export interface FeedItem {
  title: string;
  link: string;
  date: Date;
  /** Podcast only: duration in seconds. */
  duration?: number;
  /** Podcast only: episode number (oldest = 1). */
  num?: number;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatDuration(seconds: number): string {
  return `${Math.round(seconds / 60)} MIN`;
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text']);
  }
  return String(v);
}

async function fetchItems(url: string): Promise<any[]> {
  const res = await fetch(url, { headers: { 'user-agent': 'semi-doped-home/1.0' } });
  if (!res.ok) throw new Error(`Feed fetch failed (${url}): ${res.status}`);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(await res.text());
  const items = doc.rss?.channel?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

export async function getLatestEpisode(): Promise<FeedItem> {
  const items = await fetchItems(PODCAST_FEED);
  const item = items[0];
  const mp3: string = item.enclosure?.['@_url'] ?? '';
  const slug = (mp3.split('/').pop() ?? '').replace(/\.mp3$/, '').replace(/^\d+-/, '');
  return {
    title: text(item.title),
    link: `https://semidoped.fm/episodes/${slug}/`,
    date: new Date(text(item.pubDate)),
    duration: Number(text(item['itunes:duration'])) || 0,
    num: items.length,
  };
}

export async function getLatestDaily(count = 3): Promise<FeedItem[]> {
  const items = await fetchItems(DAILY_FEED);
  return items.slice(0, count).map((item: any) => ({
    title: text(item.title),
    link: text(item.link),
    date: new Date(text(item.pubDate)),
  }));
}
