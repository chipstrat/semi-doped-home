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
// "News Take: Hyperscaler CDS, SK Hynix Earnings, China's DUV…" became
// "3 Stories Behind the Semi Selloff…" — which would silently orphan a
// slug-keyed entry. Ids never change.
//
// 2026-08-05: the single-source version above still lost one. The Astera Labs
// episode uploaded 2026-08-01, and by the time anyone looked, Shorts had flushed
// every full episode out of the 15-entry window — its page had no thumbnail, no
// video embed, and shared to X as the generic brand banner instead of the
// episode art. Three sources now feed the map, and they fail at different times:
//
//   1. sdd-clips/episodes.tsv — an EXACT id join, written by sdd-pod at upload
//      from the URL it just created. Authoritative and immediate, but local-only:
//      the Semi-Doped repo's git origin is a bare repo on the framework box, not
//      GitHub, so this source simply does not exist in Actions. Running this
//      script on a machine that has the repo is the fastest repair there is.
//   2. The "Semi Doped Episodes" playlist feed — also 15 entries, but only full
//      episodes go in, so the window is ~3 months instead of ~3 days. This is the
//      source that would have caught Astera. Curated BY HAND on YouTube (nothing
//      in sdd-pod touches playlists), so a brand-new episode may not be in it yet.
//   3. The channel uploads feed — the original source. Now the backstop for
//      exactly the gap #2 leaves: the hours between upload and someone adding the
//      video to the playlist.
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bestMatch, normTitle } from './lib/title-match.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const MAP_FILE = path.join(ROOT, 'src', 'data', 'youtube.json');
const FEED_URL = 'https://feeds.buzzsprout.com/2570635.rss';
const YT_FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqIzK82kDT3zpA5OcPDg3Rg';
// "Semi Doped Episodes" — the hand-curated full-episodes playlist on @SemiDoped.
const YT_PLAYLIST_URL =
  'https://www.youtube.com/feeds/videos.xml?playlist_id=PL1ksE_rhAjO2hlw0FqhaCyIaa7BY-FIU_';
// Local-only. Both repos sit side by side in Austin's working tree; override for
// anywhere else. Absent in CI, which is expected, not an error.
const EPISODES_TSV =
  process.env.SDD_EPISODES_TSV || path.join(ROOT, '..', 'Semi-Doped', 'sdd-clips', 'episodes.tsv');

// A video cannot be an episode it predates, and is not one published months
// later. Uploads land within a few days of the podcast either way.
const MAX_DRIFT_DAYS = 21;
const DAY = 86400000;
// Anything newer than this that is still unmapped is a live problem worth
// shouting about; older gaps are episodes that never had a video at all.
const RECENT_DAYS = 45;

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '#text' in v) return String(v['#text']);
  return String(v);
};

const enclosureBase = (url) => (url.split('/').pop() ?? '').replace(/\.mp3$/, '');
export const idFromEnclosure = (url) => enclosureBase(url).match(/^(\d+)-/)?.[1] ?? '';
export const slugFromEnclosure = (url) => enclosureBase(url).replace(/^\d+-/, '');

async function xml(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'semi-doped-website/1.0' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(await res.text());
}

/**
 * Is this video a Short? `/shorts/<id>` serves a Short directly (200) and 303s a
 * regular video off to `/watch`, which is the only cheap discriminator the atom
 * feed leaves us — it carries no duration and no format.
 *
 * Worth the request: Shorts are cut FROM the episodes, so their titles share the
 * episode's vocabulary by construction and score high against it. Test B on
 * 2026-08-05 mapped the Datacenter Interconnects episode to the Short "Nvidia's
 * Insane 78-Layer PCB" at 0.80 — a wrong id, which is worse than none, because
 * the page then embeds a 40-second clip in place of the episode.
 *
 * Unknown counts as a Short: excluding a real episode costs a loud error and a
 * one-line fix, while including a Short silently ships the wrong video.
 */
async function isShort(id) {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'user-agent': 'semi-doped-website/1.0' },
    });
    return res.status === 200;
  } catch {
    return true;
  }
}

async function withoutShorts(entries, label) {
  const flags = await Promise.all(entries.map((e) => isShort(e.id)));
  const kept = entries.filter((_, i) => !flags[i]);
  const dropped = entries.length - kept.length;
  if (dropped) console.log(`  ${label}: dropped ${dropped} Short(s), ${kept.length} full video(s) left`);
  return kept;
}

/** Entries of a YouTube atom feed (channel uploads or a playlist). */
async function ytEntries(url, label) {
  try {
    const doc = await xml(url);
    const entries = doc.feed?.entry ?? [];
    return (Array.isArray(entries) ? entries : [entries])
      .map((e) => ({
        id: text(e['yt:videoId']),
        title: text(e['media:group']?.['media:title'] ?? e.title),
        date: new Date(text(e.published)),
      }))
      .filter((e) => e.id);
  } catch (err) {
    console.log(`::warning::${label} feed unavailable, no mappings captured from it: ${err}`);
    return [];
  }
}

/**
 * episodes.tsv → { bzId|siteSlug: youtubeId }. Columns (see episodes_registry.py):
 * slug, drive_folder, title, youtube_id, air_date, episode_url [, buzzsprout_id].
 * The buzzsprout id column is newer than most rows, so fall back to the site slug
 * inside episode_url — the registry writes the real published URL, so that slug is
 * exactly the one this site serves.
 */
function readEpisodesTsv() {
  if (!fs.existsSync(EPISODES_TSV)) return { byBzId: {}, bySlug: {} };
  const byBzId = {};
  const bySlug = {};
  for (const line of fs.readFileSync(EPISODES_TSV, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const c = line.split('\t');
    const ytId = (c[3] ?? '').trim();
    if (!ytId || ytId === '-') continue;
    const bzId = (c[6] ?? '').trim();
    if (bzId && bzId !== '-') byBzId[bzId] = ytId;
    const slug = (c[5] ?? '').trim().match(/\/episodes\/([^/]+)\/?$/)?.[1];
    if (slug) bySlug[slug] = ytId;
  }
  return { byBzId, bySlug };
}

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));

let episodes;
try {
  const doc = await xml(FEED_URL);
  const items = doc.rss?.channel?.item ?? [];
  episodes = (Array.isArray(items) ? items : [items]).map((it) => ({
    url: it.enclosure?.['@_url'] ?? '',
    title: text(it.title),
    date: new Date(text(it.pubDate)),
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

const missing = () => episodes.filter((ep) => idFromEnclosure(ep.url) && !map[idFromEnclosure(ep.url)]);

const added = [];
if (missing().length === 0) {
  // The common case on an hourly rebuild. Skip the registry read, both feeds and
  // every Shorts probe rather than spend ~30 requests confirming nothing changed.
  console.log('every episode already mapped — no lookups needed');
} else {
  const registry = readEpisodesTsv();
  const registrySize = Object.keys(registry.bySlug).length + Object.keys(registry.byBzId).length;
  console.log(
    registrySize
      ? `episodes.tsv: ${registrySize} id(s) available from ${EPISODES_TSV}`
      : 'episodes.tsv not present (expected in CI) — feeds only',
  );

  const [rawPlaylist, rawUploads] = await Promise.all([
    ytEntries(YT_PLAYLIST_URL, 'Episodes playlist'),
    ytEntries(YT_FEED_URL, 'YouTube uploads'),
  ]);
  console.log(`feeds: ${rawPlaylist.length} playlist entr(ies), ${rawUploads.length} upload(s)`);
  const [playlist, uploads] = await Promise.all([
    withoutShorts(rawPlaylist, 'playlist'),
    withoutShorts(rawUploads, 'uploads'),
  ]);

  /**
   * The two feeds do NOT get the same trust.
   *
   * The playlist is hand-curated to hold full episodes, so fuzzy matching is safe
   * there and earns its keep: YouTube titles the litho episode "A Masterclass on
   * Lithography" where Buzzsprout calls it "Lithography Masterclass", and exact
   * matching pairs neither of those.
   *
   * The uploads feed is whatever the channel posted last — mostly auto-posted
   * clips — so it stays exact-match-only, the behavior this script shipped with.
   * It exists to cover one narrow gap: an episode uploaded but not yet added to
   * the playlist by hand.
   */
  function matchByTitle(ep) {
    const near = (entries) => entries.filter((v) => Math.abs(v.date - ep.date) / DAY <= MAX_DRIFT_DAYS);

    const fuzzy = bestMatch(ep.title, near(playlist));
    if (fuzzy) return { id: fuzzy.item.id, source: 'playlist', score: fuzzy.score };

    const exact = near(uploads).find((v) => normTitle(v.title) === normTitle(ep.title));
    if (exact) return { id: exact.id, source: 'uploads/exact', score: 1 };

    return null;
  }

  for (const ep of missing()) {
    const id = idFromEnclosure(ep.url);
    const slug = slugFromEnclosure(ep.url);

    // Exact id join first — no scoring involved, so nothing to get wrong.
    const fromRegistry = registry.byBzId[id] ?? registry.bySlug[slug];
    const hit = fromRegistry
      ? { id: fromRegistry, source: 'episodes.tsv', score: 1 }
      : matchByTitle(ep);
    if (!hit) continue;

    map[id] = hit.id;
    added.push(`${id} -> ${hit.id}  via ${hit.source} (${hit.score.toFixed(2)})  ${ep.title.slice(0, 55)}`);
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

// A miss used to be one ::warning:: among many in a 200-line build log, which is
// how Astera stayed broken for four days. A RECENT miss is the actionable case,
// so give it a red annotation and a run-summary block that says how to fix it.
const now = Date.now();
const recent = unmapped.filter((ep) => (now - ep.date) / DAY <= RECENT_DAYS);
const stale = unmapped.filter((ep) => !recent.includes(ep));

for (const ep of recent) {
  console.log(
    `::error title=Episode has no YouTube video mapped::"${ep.title}" (id ${idFromEnclosure(ep.url)}) ` +
      `published ${ep.date.toDateString()}. Its page renders a generic tile, has no video embed, and ` +
      `shares to X as the brand banner instead of the episode thumbnail.`,
  );
}
if (stale.length) {
  console.log(`::warning::${stale.length} older episode(s) still unmapped (likely audio-only): ` +
    stale.map((e) => e.title.slice(0, 50)).join(' | '));
}

if (recent.length && process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### ⚠️ Episodes with no YouTube video',
    '',
    'These render a generic tile and share to X without episode art:',
    '',
    ...recent.map((ep) => `- \`${idFromEnclosure(ep.url)}\` — ${ep.title}`),
    '',
    'Fix any one of these, then re-run this workflow:',
    '',
    '1. Add the video to the **Semi Doped Episodes** playlist on YouTube (preferred —',
    '   it keeps the mapping findable for ~3 months instead of ~3 days).',
    '2. Or run `node scripts/refresh-youtube-map.mjs` on a machine that has the',
    '   Semi-Doped repo, which reads the id straight out of `sdd-clips/episodes.tsv`.',
    '3. Or paste the id into `src/data/youtube.json` by hand.',
    '',
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

if (migrated || added.length) {
  const ordered = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => Number(a) - Number(b)),
  );
  fs.writeFileSync(MAP_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`wrote ${MAP_FILE}`);
} else {
  console.log('youtube map already current');
}
