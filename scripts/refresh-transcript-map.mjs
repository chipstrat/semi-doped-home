#!/usr/bin/env node
// Keep src/data/transcripts.json current so every episode page links to its
// full transcript on daily.semidoped.com.
//
// Why this exists (2026-08-05): transcripts are published on the Daily Substack
// as their own posts (titled with a 🎙️), days after the episode drops. There is
// no id shared between Buzzsprout and Substack, and the transcript title is not
// the episode title — "🎙️ Semi Doped: 2026.07.29 - Astera Labs" belongs to
// "How Retimers Built an $80B Company: The Story of Astera Labs", and the date in
// that title is the RECORDING date (neither the episode's pubDate nor the post's).
// So the pairing is matched here, once, and persisted — the site build only ever
// reads the committed map.
//
// Keys are the STABLE Buzzsprout episode id (the numeric prefix of the mp3
// enclosure), for the same reason youtube.json uses it: retitling an episode
// rewrites the slug and would orphan a slug-keyed entry. Ids never change.
//
// Hand-editing is expected and safe: a committed entry is never overwritten, so
// any transcript this matcher misses (or gets wrong) can just be pasted in.
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bestMatch } from './lib/title-match.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP_FILE = path.join(HERE, '..', 'src', 'data', 'transcripts.json');
const FEED_URL = 'https://feeds.buzzsprout.com/2570635.rss';
const DAILY_HOST = 'https://daily.semidoped.com';

// A transcript post may lag its episode, but never by much in practice (0–5 days
// so far). The window is the primary guard against a false title match.
const MAX_LAG_DAYS = 45;
const DAY = 86400000;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '#text' in v) return String(v['#text']);
  return String(v);
};

const idFromEnclosure = (url) =>
  (url.split('/').pop() ?? '').replace(/\.mp3$/, '').match(/^(\d+)-/)?.[1] ?? '';

// The mic emoji is the only reliable marker: transcript titles are otherwise
// freeform ("🎙️ Semi Doped: …", "🎙️Advanced Packaging", "🎙️Computex Mania 2026").
const isTranscript = (title) => /\u{1F399}/u.test(title);

/** Strip the transcript-post furniture down to the words that name the episode. */
function transcriptSubject(title) {
  return title
    .replace(/\u{1F399}\u{FE0F}?/gu, '')
    .replace(/^\s*semi\s*doped\s*:\s*/i, '')
    .replace(/^\s*\d{4}[.\-/]\d{2}[.\-/]\d{2}\s*[-–—:]\s*/, '')
    .trim();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': BROWSER_UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function fetchXml(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/rss+xml,application/xml,*/*' },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(await res.text());
}

/**
 * Every Daily post, newest first. The archive API returns the whole publication
 * (paged), which the RSS feed does not — it only carries ~22 items, and Daily
 * issues ship every weekday, so transcripts fall out of it within ~2 weeks.
 * RSS stays as the fallback: it is the route proven to work from GitHub Actions
 * runner IPs, and an hourly rebuild always sees a new transcript inside its
 * window even when the API is unreachable.
 */
async function getDailyPosts() {
  try {
    const posts = new Map();
    // Page until an EMPTY page. A short page does not mean the end: the API
    // slices by offset and then drops posts the caller may not see, so the run
    // that built this map returned 23, then 50, then 11 for a 50-item limit.
    // Breaking on `length < limit` stopped at the first page and silently lost
    // every transcript older than three weeks.
    for (let offset = 0; offset < 1000; offset += 50) {
      const page = await fetchJson(`${DAILY_HOST}/api/v1/archive?sort=new&limit=50&offset=${offset}`);
      if (!Array.isArray(page) || page.length === 0) break;
      for (const p of page) {
        posts.set(p.slug, {
          title: String(p.title ?? ''),
          url: `${DAILY_HOST}/p/${p.slug}`,
          date: new Date(p.post_date),
        });
      }
    }
    if (posts.size) return [...posts.values()];
    throw new Error('archive API returned nothing');
  } catch (err) {
    console.log(`::warning::Daily archive API unavailable (${err}); falling back to RSS`);
  }
  const doc = await fetchXml(`${DAILY_HOST}/feed`);
  const items = doc.rss?.channel?.item ?? [];
  return (Array.isArray(items) ? items : [items]).map((it) => ({
    title: text(it.title),
    url: text(it.link),
    date: new Date(text(it.pubDate)),
  }));
}

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));

let episodes;
try {
  const doc = await fetchXml(FEED_URL);
  const items = doc.rss?.channel?.item ?? [];
  episodes = (Array.isArray(items) ? items : [items]).map((it) => ({
    id: idFromEnclosure(it.enclosure?.['@_url'] ?? ''),
    title: text(it.title),
    date: new Date(text(it.pubDate)),
  }));
} catch (err) {
  // Never fail the build over this — a stale map only costs one link.
  console.log(`::warning::podcast feed unavailable, transcript map not refreshed: ${err}`);
  process.exit(0);
}

let posts = [];
try {
  posts = (await getDailyPosts()).filter((p) => isTranscript(p.title));
} catch (err) {
  console.log(`::warning::Daily feed unavailable, no new transcripts captured: ${err}`);
}

const taken = new Set(Object.values(map));
const added = [];

for (const post of posts) {
  if (taken.has(post.url)) continue;
  const subject = transcriptSubject(post.title);
  // Only episodes that aired shortly before the post can be its transcript.
  const candidates = episodes.filter((ep) => {
    if (!ep.id || map[ep.id]) return false;
    const lag = (post.date - ep.date) / DAY;
    return lag >= -1 && lag <= MAX_LAG_DAYS;
  });

  const best = bestMatch(subject, candidates);
  if (!best) {
    console.log(`::warning::no confident episode match for transcript "${post.title}" (${post.url})`);
    continue;
  }
  map[best.item.id] = post.url;
  taken.add(post.url);
  added.push(`${best.item.id} -> ${post.url}  (${best.score.toFixed(2)})  ${best.item.title.slice(0, 55)}`);
}

if (added.length) {
  console.log(`captured ${added.length} new transcript link(s):`);
  added.forEach((a) => console.log(`  ${a}`));
  const ordered = Object.fromEntries(Object.entries(map).sort(([a], [b]) => Number(a) - Number(b)));
  fs.writeFileSync(MAP_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`wrote ${MAP_FILE}`);
} else {
  console.log('transcript map already current');
}
