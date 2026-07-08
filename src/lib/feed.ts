import { XMLParser } from 'fast-xml-parser';
import youtubeMap from '../data/youtube.json';

const FEED_URL = 'https://feeds.buzzsprout.com/2570635.rss';
// @SemiDoped uploads feed — used at build time to auto-map new episodes to
// their videos by title. The committed youtube.json (curated) wins on conflict.
const YT_FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqIzK82kDT3zpA5OcPDg3Rg';

export interface Episode {
  num: number;
  title: string;
  slug: string;
  summary: string;
  /** Full show notes as HTML (from the RSS description). */
  notesHtml: string;
  mp3: string;
  date: Date;
  /** Duration in seconds. */
  duration: number;
  guid: string;
  /** YouTube video id, when the episode has a video upload. */
  videoId?: string;
}

export function formatDuration(seconds: number): string {
  return `${Math.round(seconds / 60)} MIN`;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatDateShort(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatDateLong(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function epNum(n: number): string {
  return `EP ${String(n).padStart(3, '0')}`;
}

function slugFromEnclosure(url: string): string {
  // .../episodes/19440756-micron-s-record-profits-....mp3 -> keep the words, drop the id
  const base = url.split('/').pop()?.replace(/\.mp3$/, '') ?? '';
  return base.replace(/^\d+-/, '');
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text']);
  }
  return String(v);
}

/** Normalize a title for episode↔video matching. */
function normTitle(s: string): string {
  return s
    .replace(/\|\s*Semi Doped\s*$/i, '')
    .toLowerCase()
    .replace(/\band\b|\bthe\b|&/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Latest uploads from the channel feed, for auto-mapping new episodes. */
async function getYouTubeUploads(): Promise<{ id: string; n: string }[]> {
  try {
    const res = await fetch(YT_FEED_URL, { headers: { 'user-agent': 'semi-doped-website/1.0' } });
    if (!res.ok) return [];
    const doc = new XMLParser({ ignoreAttributes: false }).parse(await res.text());
    const entries = doc.feed?.entry ?? [];
    return (Array.isArray(entries) ? entries : [entries]).map((e: any) => ({
      id: text(e['yt:videoId']),
      n: normTitle(text(e['media:group']?.['media:title'])),
    }));
  } catch (err) {
    console.warn(`YouTube feed unavailable, using committed mapping only: ${err}`);
    return [];
  }
}

let cache: Episode[] | null = null;

export async function getEpisodes(): Promise<Episode[]> {
  if (cache) return cache;
  const res = await fetch(FEED_URL, { headers: { 'user-agent': 'semi-doped-website/1.0' } });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const items = doc.rss?.channel?.item ?? [];
  const list = Array.isArray(items) ? items : [items];
  const uploads = await getYouTubeUploads();
  const curated = youtubeMap as Record<string, string>;

  // Feed is newest-first; number from the oldest up.
  const total = list.length;
  const episodes: Episode[] = list.map((item: any, i: number) => {
    const mp3 = item.enclosure?.['@_url'] ?? '';
    const title = text(item.title);
    const slug = slugFromEnclosure(mp3);
    const videoId = curated[slug] ?? uploads.find((u) => u.n === normTitle(title))?.id;
    return {
      num: total - i,
      title,
      slug,
      summary: text(item['itunes:summary']),
      notesHtml: text(item.description),
      mp3,
      date: new Date(text(item.pubDate)),
      duration: Number(text(item['itunes:duration'])) || 0,
      guid: text(item.guid),
      videoId,
    };
  });
  cache = episodes;
  return episodes;
}
