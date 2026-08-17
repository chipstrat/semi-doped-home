# Semi Doped Home (semidoped.com)

The brand homepage for Semi Doped — the front door that routes to the
properties. Astro static site on GitHub Pages.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there
(shared with the podcast site repo, semi-doped-website).
Do not deviate without explicit user approval.

Key guardrail: professional media-brand homepage, not a semiconductor
theme park. Personality only through the wafer mark, orange accent, and type.

## Property map
- semidoped.com (this repo) — brand home
- semidoped.fm (repo: semi-doped-website) — podcast site
- daily.semidoped.com — Substack (Semi Doped Daily)
- podcast.semidoped.com — Namecheap URL-redirect to semidoped.fm

## Data sources (fetched at build time; hourly Actions rebuild)
- Podcast: https://feeds.buzzsprout.com/2570635.rss
- Daily: https://daily.semidoped.com/feed, then https://semidoped.substack.com/feed
  as backstop. Order matters: Substack's bot protection 403s GitHub Actions
  runner IPs on the *.substack.com host but serves the custom domain fine. If
  both routes fail the build uses src/data/daily-fallback.json and emits a
  `::warning::` in the run summary — if you see that, the homepage is stale.

## Social cards
- `summary_large_image` everywhere. Episode pages use the episode's YouTube
  thumbnail (`i.ytimg.com/vi/<id>/maxresdefault.jpg`); everything else uses
  `public/og/semi-doped.png`, the 2026 brand banner. An episode with no entry in
  youtube.json falls back to the banner — so a generic card means a missing
  mapping, which the deploy now reports as a red annotation (see below).

## Episode → YouTube mapping
`scripts/refresh-youtube-map.mjs` fills `src/data/youtube.json` from three
sources, and they fail at different times — that is the point of having three:
1. `sdd-clips/episodes.tsv` — exact id join, written by sdd-pod at upload.
   **Local only**: the Semi-Doped repo's origin is a bare repo on the framework
   box, not GitHub, so it never exists in Actions. Running the script on a
   machine that has the repo is the fastest repair available.
2. The **Semi Doped Episodes** playlist feed — 15 entries, but episodes-only, so
   ~3 months of coverage. Curated BY HAND on YouTube; nothing automates it.
   Fuzzy title matching is allowed here because the pool is only episodes.
3. The channel uploads feed — ~3 days of coverage before Shorts flush it.
   **Exact title match only.** Shorts are cut from the episodes and share their
   vocabulary, so fuzzy matching here pairs an episode with its own clip.

Shorts are filtered out of both feeds by probing `youtube.com/shorts/<id>`
(200 = Short, 303 = full video); an unreachable probe counts as a Short, since a
wrong id embeds someone else's video while a missing one just logs an error.

If the run summary flags an unmapped episode, the cheapest durable fix is adding
the video to the Episodes playlist — that keeps it findable for months.

## Transcripts
- Full transcripts are published as their own Daily posts (titled with a 🎙️),
  days after the episode. Nothing links the two: no shared id, and the transcript
  title is not the episode title (the date inside it is the RECORDING date).
  `scripts/refresh-transcript-map.mjs` matches them and commits
  `src/data/transcripts.json` (episode id → post URL); the build only reads it.
  Hand-editing that file is safe — existing entries are never overwritten.
- The transcript TEXT renders inline on episode pages (2026-08-17).
  `scripts/refresh-transcript-content.mjs` captures each post's body via the
  post API on the custom domain into `src/data/transcript-content.json`.
  Entries refresh every build for 30 days after first capture (posts get
  edited after shipping — speaker names, formatting), then freeze forever;
  hand-edits to frozen entries stick. A missing entry falls back to the old
  "READ THE FULL TRANSCRIPT ↗" link-out, with a `::warning::` in the run.

## Notes
- 404.astro forwards old Substack paths (/p/, /s/, /archive, …) to daily.semidoped.com.
- public/CNAME pins the custom domain (semidoped.com).

## Commands
- `npm run dev` / `npm run build` / `npm run preview`
