// Per-dimension target + verdict layer (2026-06-21).
//
// The score showed "Reviews 57/100" but never the finish line. The site audit's
// power is that every number has a published target (Core Web Vitals good/poor).
// This surfaces the thresholds already ENCODED in scoring.ts so each dimension
// reads as a prescription ("you're at 12; leaders sit above 50"), not just a
// grade — and adds a one-line overall verdict like the audit's overallVerdict().

import type { GmbProfile, GmbScores, Grade } from "./types";

export type DimStatus = "good" | "ok" | "poor";
export type DimensionVerdict = {
  key: keyof Omit<GmbScores, "overall">;
  label: string;
  score: number;
  target: string; // what a 10 looks like
  status: DimStatus;
  oneLine: string; // current state vs target, plain English
};

const statusOf = (score: number): DimStatus => (score >= 80 ? "good" : score >= 55 ? "ok" : "poor");

export function dimensionVerdicts(p: GmbProfile, s: GmbScores): DimensionVerdict[] {
  const count = p.reviewCount ?? 0;
  const rating = p.rating;
  const photos = p.photoCount ?? 0;
  const out: DimensionVerdict[] = [];

  out.push({
    key: "reviews", label: "Reviews", score: s.reviews, target: "50+ reviews at 4.3★+",
    status: statusOf(s.reviews),
    oneLine: count === 0
      ? "No reviews yet — volume is the #1 local-pack signal; local leaders sit above 50."
      : `${count} review${count === 1 ? "" : "s"}${rating != null ? ` at ${rating.toFixed(1)}★` : ""} — local leaders sit above 50 at 4.3★+.`,
  });

  const missing: string[] = [];
  if (p.websiteQuality !== "real") missing.push("a real website");
  if (!p.phone) missing.push("a phone number");
  if (!p.hasHours) missing.push("hours");
  if ((p.photoCount ?? 0) < 10 && !p.photosCapped) missing.push("a full photo gallery");
  if (!p.category) missing.push("a primary category");
  if (!p.editorialSummary) missing.push("a description");
  out.push({
    key: "completeness", label: "Profile completeness", score: s.completeness, target: "Every core field filled",
    status: statusOf(s.completeness),
    oneLine: missing.length === 0 ? "Every core field is filled — nothing missing here." : `Still missing: ${missing.join(", ")}.`,
  });

  out.push({
    key: "attributes", label: "Attributes", score: s.attributes, target: `~half of the ~${p.attributes.totalPossible} applicable set`,
    status: statusOf(s.attributes),
    oneLine: `${p.attributes.totalSet} of ~${p.attributes.totalPossible} applicable attributes set — these match you to specific searches and filters.`,
  });

  out.push({
    key: "hours", label: "Hours", score: s.hours, target: "All 7 days + holiday hours",
    status: statusOf(s.hours),
    oneLine: !p.hasHours ? "No hours set — you're excluded from \"open now\" results." : `Hours set for ${p.daysOpen}/7 days — confirm all 7 (and holidays) for \"open now\".`,
  });

  out.push({
    key: "photos", label: "Photos", score: s.photos, target: "A full, monthly-refreshed gallery (10+)",
    status: statusOf(s.photos),
    oneLine: photos === 0 ? "No photos — visuals drive calls and direction requests." : p.photosCapped ? "A full gallery (10+) — keep it fresh monthly." : `${photos} photo${photos === 1 ? "" : "s"} — build past 10 across interior/exterior/team/product.`,
  });

  out.push({
    key: "categories", label: "Categories", score: s.categories, target: "Specific primary + 2–3 secondary",
    status: statusOf(s.categories),
    oneLine: !p.category ? "No primary category — the #1 lever telling Google what you do." : p.secondaryTypeCount === 0 ? "Primary set, but no secondary categories — you're missing adjacent searches." : `Primary + ${p.secondaryTypeCount} secondary ${p.secondaryTypeCount === 1 ? "category" : "categories"} set.`,
  });

  return out;
}

/** One-line interpretation of the overall score, vertical-aware in tone. */
export function overallVerdict(scores: GmbScores, grade: Grade, verticalLabel?: string): string {
  const v = verticalLabel ? ` for a ${verticalLabel.toLowerCase()}` : "";
  if (scores.overall >= 85) return `A dialed-in profile${v} — strong across the board, with only fine-tuning left to capture the last of the local demand.`;
  if (scores.overall >= 70) return `A solid profile${v}, but specific gaps are leaving local searches — and the calls behind them — on the table.`;
  if (scores.overall >= 50) return `Below average${v} — this profile is leaking the calls and direction requests a dialed-in competitor captures every week.`;
  return `Critically under-optimized${v} — the profile is nearly invisible in the local pack and is handing its customers to better-kept listings.`;
}
