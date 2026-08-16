// Honest hotel TIER inference (2026-06-21).
//
// The Places API returns NO per-night price for lodging (priceLevel is null for
// ~88% of hotels), and brandTier() returns "standard" for every independent —
// so neither can separate a ₹2k guest house from an ₹18k palace. That tier-blind
// spot is why co-ranking on the bare head term "Hotel" mixed budget with luxury.
//
// This infers a 0–4 tier band from the only honest signals available, NEVER one
// alone: (1) a NAME-CLASS lexicon (how a guest themselves reads "Palace/Grand"
// vs "Lodge/Guest House" — the strongest free discriminator for independents),
// (2) review-volume prominence, (3) amenity richness (Google Hotels itself
// infers class from amenities), (4) brandTier for known chains. When no
// discriminating signal fires, it returns confidence:"low" so the caller WIDENS
// the gate rather than fabricating a class it can't prove (honesty rule #1).

import { brandTier } from "./brand-tier";
import type { GmbProfile } from "./types";

export type HotelTier = { band: number; confidence: "high" | "low"; tierLabel: string };

const TIER_LABELS = ["Hostel / lodge", "Budget", "Midscale", "Upscale", "Luxury"];

// Name-class tokens (lowercase, substring-matched on the display name).
const HOSTEL_TOKENS = ["hostel", "dormitory", " dorm", "backpack", "zostel", "youth hostel"];
const BUDGET_TOKENS = ["oyo", "spot ", "fabhotel", "fab hotel", "treebo", "ginger", "bloomrooms",
  "lodge", "guest house", "guesthouse", "dharamshala", "paying guest", "rest house", "homestay", " inn", "inn "];
const LUXURY_TOKENS = ["palace", "grand ", "imperial", "exotica", "oberoi", "taj", "leela", "lalit",
  "itc", "ritz", "four seasons", "shangri", "resort & spa", "resort and spa", "heritage", "retreat", "the leela"];
const UPSCALE_TOKENS = ["boutique", "suites", "residency", "regency", "plaza", "sarovar", "regenta",
  "courtyard", "comfort", "regal", "grand"];

const hasToken = (n: string, toks: string[]) => toks.some((t) => n.includes(t));

/** Tier band 0–4 from name-class + prominence + amenity + brand. `amenityCount`
 *  is the count of set attributes (only available post-detail-fetch); omit it
 *  when gating raw stubs (name-class + reviews still discriminate well). */
export function computeHotelTier(name: string, reviewCount: number | null, amenityCount?: number | null): HotelTier {
  const n = ` ${name.toLowerCase()} `;
  const rev = reviewCount ?? 0;
  const premium = brandTier(name) === "premium";

  let band: number;
  let confidence: "high" | "low";
  // Premium chain first (so "Holiday Inn" isn't read as budget via "inn").
  if (premium) { band = 4; confidence = "high"; }
  else if (hasToken(n, HOSTEL_TOKENS)) { band = 0; confidence = "high"; }
  else if (hasToken(n, BUDGET_TOKENS)) { band = 1; confidence = "high"; }
  else if (hasToken(n, LUXURY_TOKENS)) { band = 4; confidence = "high"; }
  else if (hasToken(n, UPSCALE_TOKENS)) { band = 3; confidence = "high"; }
  else {
    // No name signal — infer from prominence + amenity, but flag LOW confidence
    // so the caller widens the tier gate instead of hard-excluding on a guess.
    let b = rev >= 1500 ? 3 : rev >= 300 ? 2 : rev >= 50 ? 2 : 1;
    if (amenityCount != null && amenityCount >= 8) b += 1;
    band = Math.min(4, b);
    confidence = "low";
  }
  return { band, confidence, tierLabel: TIER_LABELS[band]! };
}

export function hotelTier(p: GmbProfile): HotelTier {
  return computeHotelTier(p.name, p.reviewCount, p.attributes?.totalSet ?? null);
}

/** The tier-qualified keyword to probe co-ranking with, so the relevance pool is
 *  pre-filtered to the right class instead of "everything that ranks for Hotel". */
export function hotelClassKeyword(tier: HotelTier): string {
  switch (tier.band) {
    case 4: return "5 star hotel";
    case 3: return "luxury hotel";
    case 2: return "hotel";
    case 1: return "budget hotel";
    default: return "guest house";
  }
}

// Lodging sub-types that share the "lodging" niche but are NOT alternatives a
// room-seeker cross-shops, + landmark tokens for iconic non-peers.
const NON_PEER_TYPES = new Set(["hostel", "banquet_hall", "wedding_venue", "event_venue", "convention_center", "campground", "rv_park"]);
const LANDMARK_TOKENS = ["museum", "fort", "monument", "heritage site", "temple", "ghat tour"];
const LODGING_TYPE_RE = /hotel|lodging|resort|motel|inn|guest|hostel|bed_and_breakfast/;

/** Excludes places that co-rank for "Hotel" but aren't true room alternatives —
 *  hostels, banquet/event venues, and landmark/iconic spots without lodging.
 *  This is an EXCLUSION co-ranking cannot bypass (unlike the niche gate), since
 *  co-ranking on a generic head term is exactly what pulls these in. */
export function isComparableLodging(primaryType: string | null, name: string): boolean {
  if (primaryType && NON_PEER_TYPES.has(primaryType)) return false;
  const n = name.toLowerCase();
  const isLodgingType = primaryType ? LODGING_TYPE_RE.test(primaryType) : false;
  if (!isLodgingType && LANDMARK_TOKENS.some((t) => n.includes(t))) return false;
  return true;
}
