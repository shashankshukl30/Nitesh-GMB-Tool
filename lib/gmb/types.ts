// GMB (Google Business Profile) analysis — type-only module.
//
// God-tier scope: reads a business's PUBLIC profile via Places API (New) and
// scores it across the factors that drive local-pack ranking (relevance,
// prominence, completeness) PLUS the depth a paid local-SEO audit charges for —
// structured attributes, review intelligence, owner-photo ratio, hours depth,
// category richness, web-presence quality, and an AI review summary.

import type { Grade } from "../grade";
import type { GmbFinding } from "./findings";
import type { MoneyLeft } from "./impact";
import type { DimensionVerdict } from "./verdicts";
import type { GmbVertical } from "./analysis";

export type { Grade };

export type GmbReview = {
  rating: number | null;
  publishTime: string | null; // ISO 8601
  relativeTime: string | null; // "3 weeks ago"
  text: string | null;
  authorName: string | null;
};

/** Structured, human-readable attribute groups (each entry is a populated
 *  feature, e.g. "Wheelchair-accessible entrance"). Empty group = not set on
 *  the profile, which is itself a completeness gap. */
export type GmbAttributes = {
  accessibility: string[];
  parking: string[];
  payments: string[];
  serviceOptions: string[]; // dine-in, takeout, delivery, curbside, reservable
  dining: string[]; // serves breakfast/lunch/dinner/veg/beer/wine/…
  amenities: string[]; // good for kids/groups, dogs, restroom, outdoor seating, live music
  isFood: boolean; // whether Dining + Service-option groups are relevant
  totalSet: number; // populated flags within the RELEVANT groups
  totalPossible: number; // flags we count for THIS business type (food = 36, else 21)
};

/** Raw public profile pulled from Places API (New) + light derivations. */
export type GmbProfile = {
  found: boolean;
  reason?: string;
  placeId: string | null;
  resolvedBy: "place-id" | "url-coords" | "name"; // how we matched the listing
  name: string;
  category: string | null; // primaryTypeDisplayName
  primaryType: string | null;
  secondaryTypeCount: number; // additional relevant categories
  types: string[];
  address: string | null;
  city: string | null; // locality from Google addressComponents (not a string-split guess)
  phone: string | null;
  website: string | null;
  websiteQuality: "real" | "social-only" | "free-host" | "none";
  googleMapsUri: string | null;
  writeReviewUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  priceRange: string | null; // e.g. "₹1,500–3,000" when Google has it
  // Photos returned by the API (0..10). The Places API (New) HARD-CAPS the
  // photos array at 10 and exposes NO total-count field — so this is a FLOOR,
  // not the true gallery size. When photosCapped is true the real total is
  // "10 or more, unknown" and we must NOT claim a photo deficit.
  photoCount: number | null;
  photosCapped: boolean; // true when photoCount hit the API's 10-photo ceiling
  businessStatus: string | null;
  hasHours: boolean;
  weekdayHours: string[];
  daysOpen: number; // 0..7 distinct days with hours
  hasSpecialHours: boolean;
  openNow: boolean | null;
  editorialSummary: string | null;
  reviewSummary: string | null; // Google's AI review summary, when available
  attributes: GmbAttributes;
  hasAccessibility: boolean;
  lat: number | null;
  lng: number | null;
  reviews: GmbReview[];
  // Derived review intelligence. NOTE: Places API returns a RELEVANCE-ranked
  // sample of up to 5 reviews, NOT the newest — so we deliberately do NOT
  // claim review recency/velocity from it (that was wrong for active
  // businesses). Sentiment/themes/benchmark are sound from a sample.
  reviewIntel: {
    sentiment: "positive" | "mixed" | "negative" | "unknown";
    positiveShare: number | null; // 0..100 from sample
    themes: string[]; // top keywords from review text
    praisedThemes: string[]; // recurring words in 4-5★ sampled reviews
    flaggedThemes: string[]; // recurring words in 1-3★ sampled reviews
    benchmark: string | null; // e.g. "below the ~4.4 typical for hotels"
  };
};

export type GmbScores = {
  overall: number;
  reviews: number;
  completeness: number;
  attributes: number;
  photos: number;
  categories: number;
  hours: number;
};

export type GmbResult = {
  query: string;
  fetchedAt: string;
  durationMs: number;
  found: boolean;
  reason?: string;
  profile: GmbProfile;
  scores: GmbScores;
  grade: Grade;
  completeness: Array<{ item: string; present: boolean; impactHint: string; fixHint: string }>;
  topIssues: string[];
  recommendations: string[]; // prioritized, specific actions
  pitchAngles: string[]; // team-facing — stripped without a session
  // ── Audit-grade conversion layer (2026-06-21) ──────────────────────────
  findings: GmbFinding[]; // severity-ranked structured findings (the action plan)
  moneyLeft: MoneyLeft; // loss-framed "money left on the table" headline (estimate)
  verdicts: DimensionVerdict[]; // per-dimension target + status + one-line
  overallVerdict: string; // one-line interpretation of the overall score
  vertical: { vertical: GmbVertical; label: string; confidence: "high" | "low" };
  // Field-presence envelope so structurally-absent data renders NEUTRAL, never
  // as a red negative (honesty rule #1 — "region-omitted" ≠ "missing").
  coverage: {
    reviewSummary: "present" | "absent";
    editorialSummary: "present" | "absent";
    hours: "set" | "not-set";
    price: "populated" | "absent-for-vertical";
  };
};
