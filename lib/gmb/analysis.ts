// Pure analysis helpers for the GMB engine — review intelligence, website
// quality, hours depth. No I/O; consumed by places.ts (mapping) + scoring.

// ── Website quality ──────────────────────────────────────────────────
const SOCIAL_HOSTS = ["facebook.com", "fb.com", "instagram.com", "linktr.ee", "linktree.com", "beacons.ai", "bento.me", "wa.me", "api.whatsapp.com", "g.page", "goo.gl"];
const FREE_HOSTS = ["wixsite.com", "weebly.com", "webs.com", "squarespace.com", "webnode.com", "webnode.page", "blogspot.com", "wordpress.com", "godaddysites.com", "business.site", "mybusiness.site", "ueniweb.com", "tilda.ws", "carrd.co", "notion.site", "super.site", "myshopify.com"];

export function websiteQuality(url: string | null): "real" | "social-only" | "free-host" | "none" {
  if (!url) return "none";
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (SOCIAL_HOSTS.some((s) => host === s || host.endsWith("." + s))) return "social-only";
    if (FREE_HOSTS.some((s) => host === s || host.endsWith("." + s))) return "free-host";
    return "real";
  } catch {
    return "none";
  }
}

// ── Vertical relevance ───────────────────────────────────────────────
// Food-specific attribute groups (Dining, Service options) only matter for
// food establishments. For a hotel / travel / clinic / shop they're noise —
// showing "Dining — none set" as a red gap is misleading.
const FOOD_TYPE_RE = /restaurant|cafe|caf[eé]|coffee|\bbar\b|bakery|\bmeal\b|food|bistro|\bpub\b|diner|eatery|fast_food|ice_cream|deli|brunch|steak|pizza|sushi|brewery|winery|tea_house/i;

export function isFoodBusiness(primaryType: string | null, types: string[]): boolean {
  if (primaryType && FOOD_TYPE_RE.test(primaryType)) return true;
  return (types ?? []).some((t) => FOOD_TYPE_RE.test(t));
}

// Vertical detection — drives tailored issue/photo copy + the benchmark, so a
// clinic, hotel, and gym don't all read with the same generic wording (the #1
// "templated AI output" tell). Confidence is "high" when the primaryType /
// category matches, "low" when only a secondary type does.
export type GmbVertical = "hotel" | "restaurant" | "cafe" | "fitness" | "healthcare" | "beauty" | "retail" | "services" | "travel" | "education" | "generic";
const VERTICAL_MATCHERS: Array<[GmbVertical, string, RegExp]> = [
  ["hotel", "hotel", /hotel|lodging|resort|guest|hostel|motel|\binn\b|bed_and_breakfast/i],
  ["cafe", "café", /cafe|caf[eé]|coffee|bakery|tea_house/i],
  ["restaurant", "restaurant", /restaurant|\bbar\b|\bpub\b|bistro|diner|eatery|food|brunch|pizza|sushi/i],
  ["fitness", "fitness studio", /gym|fitness|yoga|pilates|crossfit|martial_arts|boxing/i],
  ["healthcare", "healthcare practice", /dentist|dental|doctor|clinic|medical|hospital|physio|pharmacy|diagnostic|veterinary/i],
  ["beauty", "salon & spa", /salon|spa|beauty|barber|nail|hair|massage|wellness/i],
  ["travel", "travel business", /travel|tour_agency|tour_operator|\btour\b/i],
  ["education", "school", /school|college|university|tutor|coaching|education|preschool/i],
  ["retail", "shop", /store|shop|retail|boutique|jewel|clothing|market|dealer/i],
  ["services", "service business", /plumb|electric|contractor|repair|cleaning|hvac|lawyer|attorney|legal|account|consult|real_estate|auto/i],
];

export function detectGmbVertical(
  primaryType: string | null,
  category: string | null,
  types: string[],
): { vertical: GmbVertical; label: string; confidence: "high" | "low" } {
  const primary = `${primaryType ?? ""} ${category ?? ""}`;
  for (const [vertical, label, re] of VERTICAL_MATCHERS) if (re.test(primary)) return { vertical, label, confidence: "high" };
  for (const [vertical, label, re] of VERTICAL_MATCHERS) if ((types ?? []).some((t) => re.test(t))) return { vertical, label, confidence: "low" };
  return { vertical: "generic", label: "local business", confidence: "low" };
}

// ── Hours depth ──────────────────────────────────────────────────────
export function countDaysOpen(weekdayHours: string[]): number {
  if (weekdayHours.length === 0) return 0;
  return weekdayHours.filter((d) => !/closed/i.test(d)).length;
}

/** Distinct days-of-week with at least one open period, from the Places API's
 *  STRUCTURED regularOpeningHours.periods (open.day = 0-6). Locale-proof — the
 *  string-based countDaysOpen breaks on a localized "closed" (e.g. the Hindi
 *  market). Returns null when there are no structured periods so the caller can
 *  fall back to the string heuristic. A 24h venue reports one period with no
 *  close → still counted. */
export function daysOpenFromPeriods(periods: unknown): number | null {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const days = new Set<number>();
  for (const p of periods as Array<{ open?: { day?: number }; close?: unknown }>) {
    // A period with an `open` but NO `close` is the Places API's 24/7
    // representation — a single continuous period that means open EVERY day.
    if (p?.open && (p.close == null)) return 7;
    const d = p?.open?.day;
    if (typeof d === "number" && d >= 0 && d <= 6) days.add(d);
  }
  return days.size;
}

// ── Review intelligence ──────────────────────────────────────────────
type ReviewLike = { rating: number | null; publishTime: string | null; text: string | null };

// Rough category benchmarks (typical Google rating) for the "is this good?"
// framing. Keyed by a substring of the primary type / category.
const RATING_BENCHMARKS: Array<[RegExp, number, string]> = [
  [/hotel|lodging|resort|guest|hostel|motel/i, 4.4, "hotels"],
  [/restaurant|cafe|coffee|food|bakery|bar/i, 4.3, "restaurants"],
  [/dentist|doctor|clinic|medical|hospital|physio|spa|salon|wellness/i, 4.6, "clinics & wellness"],
  [/lawyer|attorney|legal|accountant|consultant/i, 4.7, "professional services"],
  [/store|shop|retail|boutique/i, 4.3, "retail"],
  [/plumber|electrician|contractor|repair|cleaning|hvac/i, 4.6, "home services"],
  [/gym|fitness|yoga|studio/i, 4.6, "fitness"],
];

const STOPWORDS = new Set("the a an and or but of to in on at for with is was are be been very really just so my our your their this that it they we i you he she them us not no yes can will would place service staff food room rooms time experience also had has have were our get got one all out about from they're we're".split(/\s+/));

export function computeReviewIntel(
  reviews: ReviewLike[],
  rating: number | null,
  reviewCount: number | null,
  category: string | null,
): {
  sentiment: "positive" | "mixed" | "negative" | "unknown";
  positiveShare: number | null;
  themes: string[];
  praisedThemes: string[]; // recurring words in 4-5★ sampled reviews
  flaggedThemes: string[]; // recurring words in 1-3★ sampled reviews
  benchmark: string | null;
} {
  // Sentiment from sample ratings.
  const rated = reviews.map((r) => r.rating).filter((r): r is number => typeof r === "number");
  const positiveShare = rated.length ? Math.round((rated.filter((r) => r >= 4).length / rated.length) * 100) : null;
  const sentiment =
    positiveShare == null ? "unknown" : positiveShare >= 70 ? "positive" : positiveShare >= 40 ? "mixed" : "negative";

  // NOTE: no recency/velocity — the sample is relevance-ranked, not newest.

  // Theme keywords from review text — overall + split by source-review rating so
  // the report can show what customers PRAISE (4-5★) vs FLAG (1-3★) separately.
  const counts = new Map<string, number>();
  const praise = new Map<string, number>();
  const flag = new Map<string, number>();
  for (const r of reviews) {
    if (!r.text) continue;
    const bucket = r.rating == null ? null : r.rating >= 4 ? praise : flag;
    for (const w of r.text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)) {
      if (w.length < 4 || STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
      if (bucket) bucket.set(w, (bucket.get(w) ?? 0) + 1);
    }
  }
  const topWords = (m: Map<string, number>, min: number, n: number) =>
    [...m.entries()].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
  const themes = topWords(counts, 2, 6);
  // Flagged needs a lower threshold (fewer negative reviews in a relevance sample).
  const praisedThemes = topWords(praise, 2, 5);
  const flaggedThemes = topWords(flag, 1, 5).filter((w) => !praisedThemes.includes(w));

  void reviewCount; // reserved for future cross-checks
  // Benchmark vs category.
  let benchmark: string | null = null;
  if (rating != null && (reviewCount ?? 0) > 0) {
    const hit = RATING_BENCHMARKS.find(([re]) => (category && re.test(category)) || false);
    if (hit) {
      const [, typical, label] = hit;
      const delta = rating - typical;
      benchmark = delta >= 0.1
        ? `above the ~${typical}★ typical for ${label}`
        : delta <= -0.2
          ? `below the ~${typical}★ typical for ${label} — a visible gap`
          : `around the ~${typical}★ typical for ${label}`;
    }
  }

  return { sentiment, positiveShare, themes, praisedThemes, flaggedThemes, benchmark };
}
