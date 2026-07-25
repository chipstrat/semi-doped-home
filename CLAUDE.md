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

## Notes
- 404.astro forwards old Substack paths (/p/, /s/, /archive, …) to daily.semidoped.com.
- public/CNAME pins the custom domain (semidoped.com).

## Commands
- `npm run dev` / `npm run build` / `npm run preview`
