# Design System — Semi Doped Website

## Product Context
- **What this is:** The home of the Semi Doped podcast — episode library, show notes, hosts, and a front door to Semi Doped Daily. Replaces the auto-generated Buzzsprout site (semidoped.fm) and complements the Substack (semidoped.com).
- **Who it's for:** Semiconductor professionals, engineers, and investors; also prospective guests and sponsors judging whether the show is a serious media property.
- **Space/industry:** Tech/finance podcasts. Peers: acquired.fm, colossus.com (Invest Like the Best), sharptech.fm.
- **Project type:** Editorial content site (static, Astro).
- **The memorable thing:** "Serious analysis, fun hosts." Professional podcast site first; brand personality through restrained touches, never semiconductor in-jokes or theme features.

## Aesthetic Direction
- **Direction:** Premium editorial — print-magazine structure with the Semi Doped brand system.
- **Decoration level:** Intentional — hairline rules, the wafer mark, warm radial glow on black blocks. No gradient washes, no blobs, no stock photos.
- **Mood:** Confident, warm, credible. A page a guest's comms team or a sponsor could land on and immediately take seriously.
- **Reference sites:** acquired.fm (warmth, editorial hero), colossus.com/series/invest-like-the-best (structure, episode numbers, typographic episode cards).

## Brand Assets (canonical — see brand/)
- **Wafer mark:** 4×4 dot lattice, corners removed (wafer silhouette), one open-ring "doped" atom at position (60,60). Column colors left→right: `#F2C300`, `#F0951C`, `#E96822`, `#D94A1E`. White mode: all dots white, for use over video/photos. Dot r=7.5 on a 100×100 viewBox; doped ring r=6.5, stroke-width 3.
- **Wordmark:** All-caps `SEMI DOPED` in Oxanium 700, letter-spacing .12em. SEMI in ink/white, DOPED in orange `#E96822`. Gradient is reserved for the wafer mark only — never on text.
- Reference collateral: `brand/semi-doped-logo-options.html` (source exploration file).

## Typography
- **Display:** Oxanium 600–700 — the brand font; wordmark, headlines, episode titles, buttons, host names. Letter-spacing: .12em on the wordmark, ~.005–.02em on headlines.
- **Body:** IBM Plex Sans 400 (500/600 for emphasis) — matches existing video collateral; engineering-adjacent neutrality without SaaS genericness.
- **UI/Labels:** IBM Plex Sans 500–600, or Oxanium 600 for button labels.
- **Data/metadata:** IBM Plex Mono 400–500 — episode numbers, dates, durations, timestamps, footer. Uppercase with .1–.16em tracking for kickers.
- **Code:** IBM Plex Mono.
- **Loading:** Google Fonts — `Oxanium:wght@300..800`, `IBM+Plex+Sans:wght@300;400;500;600;700`, `IBM+Plex+Mono:wght@400;500`. Self-host later if performance demands.
- **Scale:** 12 (mono meta) · 15 (secondary) · 17 (body) · 21 (episode title in list) · 28 (h2) · 52 (h1 hero). Line-height 1.6 body, ~1.1 display.

## Color
- **Approach:** Restrained — warm neutrals + one hot accent; full brand gradient lives only in the wafer mark's dots.
- **Canvas (background):** `#F5F1E8` warm cream.
- **Surface:** `#FDFBF5` — cards, player.
- **Ink (primary text):** `#17130D`.
- **Muted text:** `#6E6557`.
- **Hairline:** `#D8CFBD` — 1px rules and borders.
- **Brand black:** `#070707` — full-bleed sections (Daily signup, footer-adjacent blocks), episode art tiles. Pair with warm radial glow: `radial-gradient(55% 130% at 78% 50%, rgba(233,104,34,.22), transparent 62%)`.
- **Accent (primary):** Orange `#E96822` — links, play buttons, active states, DOPED in the wordmark.
- **Brand lattice colors:** Yellow `#F2C300`, mid-orange `#F0951C`, orange `#E96822`, brick `#D94A1E`.
- **On-black text:** `#F5F1E8` primary, `#8a8a90` muted.
- **Semantic:** success `#3E7C4F`, warning `#F2C300`, error `#D94A1E`, info `#4A6FA5` (rarely needed on a content site).
- **Dark mode:** Not in v1. The brand-black sections provide the dark register; revisit if requested.

## Spacing
- **Base unit:** 8px.
- **Density:** Comfortable-to-spacious; editorial breathing room. Episode list rows are the densest surface.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64).

## Layout
- **Approach:** Grid-disciplined editorial. Hairline rules separate sections; generous hero.
- **Max content width:** 1160px, 28–40px side padding.
- **Grid:** Single column flow with 2-col grids for hosts/cards; episode rows are `[88px art] [flex title/summary] [auto meta]`.
- **Border radius:** sm 10px (tiles), md 12px (cards, player), full 9999px (buttons, pills). No bubble-radius on everything — rectangles with hairlines are the default.

## Episode Art (generated)
- Per-episode square tile generated at build time from metadata: brand-black background, warm radial glow, wafer mark, `EP NNN` in Oxanium 700, bottom gradient bar whose colors rotate through the lattice palette by episode number.
- Same generator should export: square PNG (podcast platforms) and 16:9 (YouTube thumbnail base) when needed.
- Never use the reused static logo cover as episode art on the site.

## Motion
- **Approach:** Minimal-functional. Color/border transitions ~.2s ease on hover; canvas transition .35s. No scroll-driven choreography, no entrance animations in v1.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out).
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms).

## Voice in UI copy
- Mono uppercase kickers for metadata (`EP 035 · JULY 3, 2026 · 50 MIN`).
- Plain confident labels ("Recent Episodes", "Your Hosts", "Semi Doped Daily"). No cleverness in navigation.
- Platform links prominent: WATCH ON YOUTUBE pill + Apple/Spotify/RSS.

## Data
- Episodes: Buzzsprout RSS `https://feeds.buzzsprout.com/2570635.rss`, fetched at build time.
- YouTube: https://youtube.com/@SemiDoped
- Daily: https://www.semidoped.com/ (Substack signup).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-08 | Initial design system created | /design-consultation: research on acquired.fm + colossus.com, three-canvas HTML preview, Austin picked cream |
| 2026-07-08 | Professional over themed | Austin rejected datasheet/wafer-yield-map direction: "just professional podcast" |
| 2026-07-08 | Oxanium + wafer mark canonical | Austin supplied brand file (brand/semi-doped-logo-options.html) and chose Oxanium + wafer logo |
| 2026-07-08 | Generated episode art tiles | No bespoke per-episode cover art exists; build-time generation keeps the library on-brand |
