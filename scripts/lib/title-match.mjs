// Pairing an episode with something that refers to it by a DIFFERENT title.
//
// Both refresh scripts hit the same wall: the episode's canonical title lives in
// the Buzzsprout feed, and everywhere else it is rewritten. YouTube carries
// "A Masterclass on Lithography" for the episode Buzzsprout calls "Lithography
// Masterclass"; the Daily calls it "🎙️A Masterclass on IC Lithography". Exact
// matching after normalization pairs none of those.
//
// Containment scoring pairs all three, and the guards below are what keep it from
// pairing things it shouldn't: a wrong id is worse than a missing one, because a
// missing id renders a generic tile while a wrong id renders someone else's video.

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'is', 'it', 'its', 'on', 'in', 'of', 'for',
  'to', 'with', 'at', 's', 'how', 'why', 'what', 'as', 'are', 'be', 'more',
]);

/**
 * Strict normalization, for pools where a near-miss is not safe to accept.
 * Same shape as normTitle() in src/lib/feed.ts — keep them in step.
 */
export function normTitle(s) {
  return String(s)
    .replace(/\|\s*Semi Doped\s*$/i, '')
    .toLowerCase()
    .replace(/\band\b|\bthe\b|&/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function tokens(s) {
  return new Set(
    String(s)
      .replace(/\|\s*Semi Doped\s*$/i, '')
      .toLowerCase()
      .replace(/[‘’']/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !STOP.has(w)),
  );
}

/**
 * How much of the SHORTER title the two share, 0–1. Deliberately not Jaccard:
 * the titles being compared are routinely different lengths on purpose — a
 * transcript post titled "Astera Labs" is a correct match for an episode titled
 * "How Retimers Built an $80B Company: The Story of Astera Labs", and Jaccard
 * would score that pair 0.2 and throw it away.
 */
export function containment(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hits = 0;
  for (const w of A) if (B.has(w)) hits += 1;
  return hits / Math.min(A.size, B.size);
}

/**
 * Best candidate for `subject`, or null when nothing is safe to commit.
 *
 * Two guards, and the margin is the one that matters. Containment alone rates a
 * two-word subject 1.00 against anything containing those two words, so a title
 * that is generic enough to fit several episodes fits them all perfectly. If the
 * runner-up is within `minMargin`, the titles are too generic to tell apart and
 * the pair is left for a human rather than guessed.
 *
 * Callers should filter `candidates` by date BEFORE calling: nothing here knows
 * that a video published four months after an episode cannot be that episode.
 */
export function bestMatch(subject, candidates, opts = {}) {
  const { minScore = 0.6, minMargin = 0.15, title = (c) => c.title } = opts;
  const ranked = candidates
    .map((item) => ({ item, score: containment(subject, title(item)) }))
    .sort((x, y) => y.score - x.score);

  const [best, runnerUp] = ranked;
  if (!best || best.score < minScore) return null;
  if (runnerUp && best.score - runnerUp.score < minMargin) return null;
  return best;
}
