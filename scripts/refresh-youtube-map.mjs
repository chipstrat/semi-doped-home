#!/usr/bin/env node
// Keep src/data/youtube.json current so episode thumbnails never go generic.
//
// Why this exists (2026-07-29): episode art is a YouTube still keyed on videoId.
// feed.ts resolves that from this committed map, falling back to title-matching
// against the channel RSS. But that RSS only ever returns the 15 most recent
// uploads, and since sdd-clips started auto-posting Shorts (2026-07-18) clips
// saturate the window in days — 13 of 15 entries were clips. The map was last
// hand-edited 2026-07-10, so EP 036 (WEKA) and EP 037 (PicoJool) aged out of the
// window before anyone curated them and fell back to the generated "EP 0NN" tile.
//
// Run on every build: while a new episode's video is still inside the 15-entry
// window, persist the mapping so it survives after it drops out.
//
// Keys are the STABLE Buzzsprout episode id (the numeric prefix of the mp3
// enclosure), not the title-derived slug: retitling an episode rewrites the slug
// — watched it happen live on 2026-07-29 when
// "News Take: Hyperscaler Debt & CDS…" became "3 Stories Behind the Semi Selloff…"
// — which would silently orphan a slug-keyed entry. Ids never change.
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP_FILE = path.join(HERE, '..', 'src', 'data', 'youtube.json');
const FEED_URL = 'https://feeds.buzzsprout.com/2570635.rss';
const YT_FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqIzK82kDT3zpA5OcPDg3Rg';

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '#text' in v) return String(v['#text']);
  return String(v);
};

// Must stay identical to normTitle() in src/lib/feed.ts.
const normTitle = (s) =>
  s
    .replace(/\|\s*Semi Doped\s*$/i, '')
    .toLowerCase()
    .replace(/\band\b|\bthe\b|&/g, '')
    .replace(/[^a-z0-9]+/g, '');

const enclosureBase = (url) => (url.split('/').pop() ?? '').replace(/\.mp3$/, '');
export const idFromEnclosure = (url) => enclosureBase(url).match(/^(\d+)-/)?.[1] ?? '';
export const slugFromEnclosure = (url) => enclosureBase(url).replace(/^\d+-/, '');

async function xml(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'semi-doped-website/1.0' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(await res.text());
}

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));

let episodes;
try {
  const doc = await xml(FEED_URL);
  const items = doc.rss?.channel?.item ?? [];
  episodes = (Array.isArray(items) ? items : [items]).map((it) => ({
    url: it.enclosure?.['@_url'] ?? '',
    title: text(it.title),
  }));
} catch (err) {
  // Never fail the build over this — a stale map only costs a thumbnail.
  console.log(`::warning::podcast feed unavailable, youtube map not refreshed: ${err}`);
  process.exit(0);
}

// One-time migration: re-key any legacy slug entries onto their episode id.
let migrated = 0;
for (const ep of episodes) {
  const id = idFromEnclosure(ep.url);
  const slug = slugFromEnclosure(ep.url);
  if (id && !map[id] && map[slug]) {
    map[id] = map[slug];
    delete map[slug];
    migrated += 1;
  }
}

let uploads = [];
try {
  const doc = await xml(YT_FEED_URL);
  const entries = doc.feed?.entry ?? [];
  uploads = (Array.isArray(entries) ? entries : [entries]).map((e) => ({
    id: text(e['yt:videoId']),
    n: normTitle(text(e['media:group']?.['media:title'])),
  }));
} catch (err) {
  console.log(`::warning::YouTube feed unavailable, no new mappings captured: ${err}`);
}

const added = [];
for (const ep of episodes) {
  const id = idFromEnclosure(ep.url);
  if (!id || map[id]) continue;
  const hit = uploads.find((u) => u.n === normTitle(ep.title));
  if (hit?.id) {
    map[id] = hit.id;
    added.push(`${id} -> ${hit.id}  ${ep.title.slice(0, 60)}`);
  }
}

const unmapped = episodes.filter((ep) => {
  const id = idFromEnclosure(ep.url);
  return id && !map[id];
});

if (migrated) console.log(`re-keyed ${migrated} legacy slug entries onto episode ids`);
if (added.length) {
  console.log(`captured ${added.length} new mapping(s):`);
  added.forEach((a) => console.log(`  ${a}`));
}
if (unmapped.length) {
  // Visible, not fatal: these render the generated tile until someone maps them.
  console.log(`::warning::${unmapped.length} episode(s) have no YouTube mapping and have ` +
    `aged out of the 15-entry feed window: ${unmapped.map((e) => e.title.slice(0, 50)).join(' | ')}`);
}

if (migrated || added.length) {
  const ordered = Object.fromEntries(Object.entries(map));
  fs.writeFileSync(MAP_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`wrote ${MAP_FILE}`);
} else {
  console.log('youtube map already current');
}
