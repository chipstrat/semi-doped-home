#!/usr/bin/env node
// Keep src/data/transcript-content.json current so every episode page can
// render its full transcript INLINE instead of only linking to the Daily.
//
// Why this exists (2026-08-17): transcripts.json maps each episode to its
// transcript post on daily.semidoped.com, and the episode page used to end at
// a "READ THE FULL TRANSCRIPT ↗" link. The full text now lives on the page.
// The body comes from the Substack post API on the custom domain (the
// *.substack.com host 403s Actions IPs; daily.semidoped.com serves the same
// content 200 — see src/lib/feeds.ts for the same lesson).
//
// Refetch policy: a transcript post keeps getting edited for a while after it
// ships (speaker-name fixes, formatting), so an entry is refreshed on every
// build until FREEZE_DAYS after its first capture, then never touched again.
// Hand-editing a frozen entry is safe — it will not be overwritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP_FILE = path.join(HERE, '..', 'src', 'data', 'transcripts.json');
const CONTENT_FILE = path.join(HERE, '..', 'src', 'data', 'transcript-content.json');
const DAILY_HOST = 'https://daily.semidoped.com';
const FREEZE_DAYS = 30;
const DAY = 86400000;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Substack furniture that has no place in a reprinted transcript. */
function sanitize(html) {
  return (
    html
      // Subscribe/share buttons: <p class="button-wrapper" ...><a class="button" ...>…</a></p>
      .replace(/<p[^>]*class="[^"]*button-wrapper[^"]*"[^>]*>[\s\S]*?<\/p>/g, '')
      // Subscription widget blocks (not seen in transcript posts yet, but cheap to guard)
      .replace(/<div[^>]*class="[^"]*subscription-widget[^"]*"[^>]*>[\s\S]*?<\/form>\s*<\/div>\s*<\/div>/g, '')
      .trim()
  );
}

const slugFromUrl = (url) => url.split('/p/').pop()?.replace(/\/+$/, '') ?? '';

async function fetchBody(url) {
  const slug = slugFromUrl(url);
  if (!slug) throw new Error(`no slug in ${url}`);
  const res = await fetch(`${DAILY_HOST}/api/v1/posts/${slug}`, {
    headers: { 'user-agent': BROWSER_UA },
  });
  if (!res.ok) throw new Error(`${res.status} for ${slug}`);
  const post = await res.json();
  if (post.audience && post.audience !== 'everyone') {
    throw new Error(`post ${slug} is not public (audience=${post.audience}) — not reprinting`);
  }
  const html = sanitize(String(post.body_html ?? ''));
  if (html.length < 1000) throw new Error(`suspiciously short body (${html.length}) for ${slug}`);
  return html;
}

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const content = fs.existsSync(CONTENT_FILE)
  ? JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'))
  : {};

let changed = false;
for (const [id, url] of Object.entries(map)) {
  const entry = content[id];
  const frozen = entry && Date.now() - new Date(entry.first).getTime() > FREEZE_DAYS * DAY;
  if (frozen) continue;
  try {
    const html = await fetchBody(url);
    if (!entry || entry.html !== html) {
      content[id] = { url, html, first: entry?.first ?? new Date().toISOString() };
      changed = true;
      console.log(`${entry ? 'refreshed' : 'captured'} ${id} (${html.length} bytes)`);
    }
  } catch (err) {
    // A failed refresh keeps the committed copy; a failed first capture just
    // leaves the episode on the old link-out behavior. Loud either way — a
    // quiet fallback is how the Daily section went stale for 16 days.
    console.log(`::warning::transcript content ${id}: ${err.message}`);
  }
}

if (changed) {
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 1) + '\n');
  console.log(`wrote ${CONTENT_FILE}`);
} else {
  console.log('no changes');
}
