// GMB-presence score for the lead reservoir — computed from the data we
// ALREADY scraped from Places API (rating, reviews, photos, website, status).
// ZERO extra API calls, so it can run across every lead for free. The deep
// /gmb tool (hours, attributes, AI summary) is the on-demand single-lookup.

import { scoreToGrade } from "../grade";
import { websiteQuality } from "./analysis";
import type { Grade } from "./types";

export type GmbPresence = {
  score: number; // 0..100
  grade: Grade;
  gaps: string[]; // short, ranked weaknesses ("No reviews", "3 photos")
};

export type PresenceInput = {
  rating?: number | null;
  review_count?: number | null;
  photo_count?: number | null;
  website?: string | null;
  social_only?: number | boolean | null;
  business_status?: string | null;
};

export function gmbPresenceScore(l: PresenceInput): GmbPresence {
  const count = l.review_count ?? 0;
  const rating = l.rating ?? null;

  // Reviews (rating × volume).
  let reviews = 0;
  if (count > 0) {
    const base = rating != null ? Math.max(0, Math.min(100, ((rating - 2.5) / 2.5) * 100)) : 60;
    const vf =
      count >= 200 ? 1 : count >= 100 ? 0.95 : count >= 50 ? 0.9
      : count >= 20 ? 0.8 : count >= 10 ? 0.68 : count >= 5 ? 0.5 : 0.35;
    reviews = Math.round(base * vf);
  }

  // Photos. The scraper stores photos.length from the Places API, which is
  // HARD-CAPPED at 10 — so 10 means "10 or more" and is the strongest signal
  // we can confirm. Treat the cap as a full, healthy gallery; below it, the
  // count is real and scored fairly (mirrors lib/gmb/scoring.ts::photosScore).
  const pc = l.photo_count ?? 0;
  const photos = pc === 0 ? 0 : pc >= 10 ? 100 : pc < 3 ? 45 : pc < 6 ? 70 : 88;

  // Website quality (social_only flag from the scraper wins if set).
  const wq = l.social_only ? "social-only" : websiteQuality(l.website ?? null);
  const web = wq === "real" ? 100 : wq === "free-host" ? 50 : wq === "social-only" ? 30 : 0;

  const statusOk = !l.business_status || l.business_status === "OPERATIONAL";
  let score = Math.round(reviews * 0.45 + photos * 0.25 + web * 0.3);
  if (!statusOk) score = Math.round(score * 0.4); // closed/temporarily-closed tank it

  const gaps: string[] = [];
  if (!statusOk) gaps.push(l.business_status === "CLOSED_PERMANENTLY" ? "Marked permanently closed" : "Marked temporarily closed");
  if (count === 0) gaps.push("No reviews");
  else if (count < 10) gaps.push(`Only ${count} reviews`);
  if (rating != null && rating < 4.0 && count > 0) gaps.push(`${rating.toFixed(1)}★ rating`);
  if (pc === 0) gaps.push("No photos");
  else if (pc < 6) gaps.push(`Only ${pc} photos visible`);
  if (wq === "none") gaps.push("No website");
  else if (wq === "social-only") gaps.push("Social-only website");

  score = Math.max(0, Math.min(100, score));
  return { score, grade: scoreToGrade(score), gaps: gaps.slice(0, 4) };
}
