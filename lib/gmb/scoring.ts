// GMB scoring — six weighted dimensions into an overall health score.
//   reviews 25 · completeness 22 · attributes 16 · hours 15 · photos 12 · categories 10

import { scoreToGrade } from "../grade";
import type { GmbProfile, GmbScores, Grade } from "./types";

export function reviewsScore(p: GmbProfile): number {
  const count = p.reviewCount ?? 0;
  if (count === 0) return 0;
  const rating = p.rating ?? 4.0;
  // Quality: rating mapped 2.5★→0, 5★→100 (sub-2.5 is rare; clamps to 0).
  const quality = Math.max(0, Math.min(100, ((rating - 2.5) / 2.5) * 100));
  // Volume: a saturating curve — a credible base by ~50-100 reviews, full at 200+.
  const volume =
    count >= 200 ? 100 : count >= 100 ? 92 : count >= 50 ? 82
    : count >= 20 ? 68 : count >= 10 ? 52 : count >= 5 ? 38 : 22;
  // ADDITIVE split, not multiplicative. The old base×volumeFactor double-counted
  // low volume — crushing a 4.8★/8-review place (~46) BELOW a 4.2★/60-review one
  // (~61) on the very dimension the UI labels "rating + volume". Splitting them
  // lets a high rating earn its quality credit on a thin base while volume stays
  // a separate, smaller component. No recency: the review sample is relevance-
  // ranked, not newest, so velocity isn't reliably measurable.
  return clamp(0.7 * quality + 0.3 * volume);
}

export type CompletenessItem = { item: string; present: boolean; impactHint: string; fixHint: string };

export function completenessItems(p: GmbProfile): CompletenessItem[] {
  const items: CompletenessItem[] = [
    { item: "Real website (not social-only)", present: p.websiteQuality === "real",
      impactHint: "Visitors who want to learn more or book have nowhere to go.", fixHint: "Link a real, fast site on your own domain (NAP identical to the profile)." },
    { item: "Phone number", present: !!p.phone,
      impactHint: "No tap-to-call from the listing — the highest-intent action.", fixHint: "Add your primary phone number in Google Business Profile." },
    { item: "Business hours", present: p.hasHours,
      impactHint: "You're excluded from \"open now\" searches.", fixHint: "Set hours for all 7 days plus holiday hours." },
    // "10+" is the honest bar: the API can't see past 10, so reaching the cap
    // is the strongest photo signal it can confirm.
    { item: "Photo gallery (10+)", present: (p.photoCount ?? 0) >= 10,
      impactHint: "Profiles with photos get far more calls + direction requests.", fixHint: "Add interior/exterior/team/product shots, refreshed monthly." },
    { item: "Primary category", present: !!p.category,
      impactHint: "The #1 lever telling Google which searches to show you in.", fixHint: "Set the most specific primary category for your core service." },
    { item: "Description", present: !!p.editorialSummary,
      impactHint: "Google has no owner text to rank or quote.", fixHint: "Write a keyword-aware \"from the business\" description." },
    { item: "Attributes set (5+)", present: p.attributes.totalSet >= 5,
      impactHint: "Attributes match you to specific searches + filters.", fixHint: `Fill payments, accessibility, parking${p.attributes.isFood ? ", service & dining options" : ", amenities"}.` },
  ];
  // Price info is only a fair completeness item where Google ACTUALLY populates
  // it — food/retail. For lodging/clinics/services the Places API (New) returns
  // priceLevel/priceRange null structurally (the prices on Google search are
  // Google Hotels data, not this API), so scoring it there is a guaranteed-fail
  // that silently docks every such profile ~2.75 overall points for a field
  // they can never fill. completenessScore is ratio-based, so omitting it just
  // shrinks the denominator. (isFood is the price-capable signal we have.)
  if (p.attributes.isFood) {
    items.splice(6, 0, { item: "Price info", present: p.priceLevel != null || !!p.priceRange,
      impactHint: "Diners filter by price band — missing it drops you from those results.", fixHint: "Set your price level in Google Business Profile." });
  }
  return items;
}

export function completenessScore(p: GmbProfile): number {
  const items = completenessItems(p);
  return Math.round((items.filter((i) => i.present).length / items.length) * 100);
}

export function attributesScore(p: GmbProfile): number {
  const { totalSet, totalPossible } = p.attributes;
  if (totalPossible === 0 || totalSet === 0) return 0;
  // Fill-ratio against the RELEVANT attributes only — vertical-fair. Setting
  // ~half the applicable attributes earns full marks (real profiles rarely
  // fill everything).
  return clamp((totalSet / totalPossible) * 200);
}

export function photosScore(p: GmbProfile): number {
  const n = p.photoCount ?? 0;
  if (n === 0) return 0;
  // The API caps photos at 10 with no true total. When we hit the cap the
  // gallery is "10+" — a healthy, active library — so award full marks rather
  // than falsely penalise. Below the cap, n is the REAL count: score it fairly.
  if (p.photosCapped) return 100;
  if (n < 3) return 45;
  if (n < 6) return 70;
  return 88; // 6–9 real photos: solid, just shy of a full gallery
}

export function categoriesScore(p: GmbProfile): number {
  if (!p.category) return 0;
  let s = 60;
  const sec = p.secondaryTypeCount;
  s += sec >= 3 ? 40 : sec === 2 ? 25 : sec === 1 ? 15 : 0;
  return clamp(s);
}

export function hoursScore(p: GmbProfile): number {
  if (!p.hasHours) return 0;
  let s = 60;
  s += p.daysOpen >= 7 ? 40 : p.daysOpen === 6 ? 30 : p.daysOpen === 5 ? 20 : 10;
  return clamp(s);
}

export function scoreProfile(p: GmbProfile): { scores: GmbScores; grade: Grade } {
  const reviews = reviewsScore(p);
  const completeness = completenessScore(p);
  const attributes = attributesScore(p);
  const photos = photosScore(p);
  const categories = categoriesScore(p);
  const hours = hoursScore(p);
  const overall = Math.round(
    reviews * 0.25 + completeness * 0.22 + attributes * 0.16 + hours * 0.15 + photos * 0.12 + categories * 0.1,
  );
  return {
    scores: { overall, reviews, completeness, attributes, photos, categories, hours },
    grade: scoreToGrade(overall),
  };
}

function clamp(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}
