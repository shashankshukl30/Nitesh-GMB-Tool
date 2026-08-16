// GMB findings — the audit-grade, severity-ranked finding model (2026-06-21).
//
// The profile-health report used to emit a FLAT string[] that the UI numbered
// 1..12, so a PERMANENTLY-CLOSED catastrophe and "add a secondary category"
// read at the same weight. This turns each finding into a typed object with
// severity + effort + dimension so the report can rank by impact-per-effort and
// group "fix today (quick wins)" vs "strategic (hire help)" — the structure that
// makes a conversion-grade audit (mirrors lib/audit's ranked-issues model).
//
// Copy is kept verbatim from the prior issues.ts so nothing the operator already
// trusts changes — only the STRUCTURE around it is new.

import type { GmbProfile } from "./types";

export type GmbSeverity = "critical" | "high" | "medium" | "low";
// Quick win (<1hr, owner can self-serve) · This week · Strategic (needs an agency)
export type GmbEffort = "quick" | "week" | "strategic";

export type GmbFinding = {
  id: string;
  dimension: string;
  severity: GmbSeverity;
  title: string; // short label for the chip
  plainEnglish: string; // the full, benchmarked explanation
  fix: string; // the specific action
  effort: GmbEffort;
  impact?: string; // money/loss estimate, filled by impact.ts
};

const SEV_RANK: Record<GmbSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** The structured, severity-ranked findings for a profile. Sorted critical→low. */
export function buildFindings(p: GmbProfile): GmbFinding[] {
  const out: GmbFinding[] = [];
  const count = p.reviewCount ?? 0;
  const ri = p.reviewIntel;
  const add = (f: GmbFinding) => out.push(f);

  // ── Status (top-pinned catastrophes) ───────────────────────────────────
  if (p.businessStatus === "CLOSED_PERMANENTLY")
    add({ id: "status-closed-perm", dimension: "Status", severity: "critical", title: "Listed permanently closed",
      plainEnglish: `Google lists this business as PERMANENTLY CLOSED — if that's wrong it is silently killing every search. Fix this first.`,
      fix: `Reinstate the listing in Google Business Profile (request reopening / appeal the closure) — nothing else matters until this clears.`, effort: "quick" });
  else if (p.businessStatus === "CLOSED_TEMPORARILY")
    add({ id: "status-closed-temp", dimension: "Status", severity: "critical", title: "Marked temporarily closed",
      plainEnglish: `Marked temporarily closed — you're filtered out of "open now" and most local results until cleared.`,
      fix: `Clear the "temporarily closed" flag in Google Business Profile the moment you're operating.`, effort: "quick" });

  // ── Reviews ────────────────────────────────────────────────────────────
  if (count === 0)
    add({ id: "reviews-zero", dimension: "Reviews", severity: "critical", title: "No Google reviews",
      plainEnglish: `No Google reviews — reviews are the single biggest local-ranking signal. With zero, you're effectively invisible in the local pack.`,
      fix: `Launch a review-request flow — QR at point of sale + a post-visit WhatsApp/SMS link — to add 5–10 fresh reviews a month.`, effort: "strategic" });
  else if (count < 10)
    add({ id: "reviews-thin", dimension: "Reviews", severity: "high", title: `Only ${count} review${count === 1 ? "" : "s"}`,
      plainEnglish: `Only ${count} review${count === 1 ? "" : "s"} — competitors with 50+ outrank you on volume alone.`,
      fix: `Launch a review-request flow (QR + post-visit WhatsApp/SMS) targeting 5–10 fresh reviews a month until you clear 50.`, effort: "strategic" });
  else if (count < 30)
    add({ id: "reviews-building", dimension: "Reviews", severity: "medium", title: `${count} reviews — below the leaders`,
      plainEnglish: `${count} reviews — a start, but local leaders sit well above 50.`,
      fix: `Keep a steady review-request cadence (5–10/month) until you pass the ~50 local-leader threshold.`, effort: "strategic" });

  // ── Rating ─────────────────────────────────────────────────────────────
  if (p.rating != null && count > 0 && (p.rating < 4.2 || (ri.benchmark && ri.benchmark.includes("below"))))
    add({ id: "rating-low", dimension: "Rating", severity: "high", title: `${p.rating.toFixed(1)}★ rating`,
      plainEnglish: `${p.rating.toFixed(1)}★${ri.benchmark ? ` — ${ri.benchmark}` : " — below the ~4.2 trust threshold most buyers use"}. Profiles under it get skipped even when they rank.`,
      fix: `Reply to every review and resolve the recurring complaints — owner responses + a rising rating lift both ranking and conversion.`, effort: "strategic" });

  if (ri.sentiment === "negative" && count > 0)
    add({ id: "sentiment-neg", dimension: "Rating", severity: "high", title: "Negative review themes",
      plainEnglish: `Recent review sentiment skews negative${ri.themes.length ? ` (themes: ${ri.themes.slice(0, 3).join(", ")})` : ""} — reputation work needed before more traffic helps.`,
      fix: `Triage the recurring complaint themes operationally, then reply publicly to show they're resolved.`, effort: "strategic" });

  // ── Website ────────────────────────────────────────────────────────────
  if (p.websiteQuality === "none")
    add({ id: "web-none", dimension: "Website", severity: "high", title: "No website linked",
      plainEnglish: `No website linked — every visitor who wants to learn more, see a menu, or book has nowhere to go.`,
      fix: `Link a real, fast website with the NAP identical to the profile.`, effort: "strategic" });
  else if (p.websiteQuality === "social-only")
    add({ id: "web-social", dimension: "Website", severity: "medium", title: "Links a social page, not a site",
      plainEnglish: `Your profile links to a social page, not a real website — you lose SEO, trust, and a proper booking/contact flow.`,
      fix: `Replace the social link with a real website on your own domain.`, effort: "strategic" });
  else if (p.websiteQuality === "free-host")
    add({ id: "web-free", dimension: "Website", severity: "low", title: "Site on a free template host",
      plainEnglish: `Your site is on a free template host — slow, generic, and capped on customization. A real domain + fast site lifts trust and ranking.`,
      fix: `Migrate to a fast site on your own domain.`, effort: "strategic" });

  // ── Hours ──────────────────────────────────────────────────────────────
  if (!p.hasHours)
    add({ id: "hours-none", dimension: "Hours", severity: "high", title: "No business hours set",
      plainEnglish: `No business hours set — excluded from "open now" results, and visitors can't tell if you're open.`,
      fix: `Set accurate hours for all 7 days (and holiday hours) so you appear in "open now" searches.`, effort: "quick" });
  else if (p.daysOpen > 0 && p.daysOpen < 7)
    add({ id: "hours-partial", dimension: "Hours", severity: "medium", title: `Hours set for ${p.daysOpen}/7 days`,
      plainEnglish: `Hours set for only ${p.daysOpen} of 7 days — confirm every day (mark closed days explicitly) so "open now" works correctly.`,
      fix: `Confirm hours for every day of the week, marking closed days explicitly.`, effort: "quick" });

  // ── Photos ─────────────────────────────────────────────────────────────
  const photos = p.photoCount ?? 0;
  if (photos === 0)
    add({ id: "photos-none", dimension: "Photos", severity: "high", title: "No photos",
      plainEnglish: `No photos — profiles with photos get far more calls and direction requests. Visuals are a ranking + trust signal now.`,
      fix: `Add interior, exterior, team, and product/room shots — then a few fresh ones each month.`, effort: "week" });
  else if (!p.photosCapped && photos < 6)
    add({ id: "photos-thin", dimension: "Photos", severity: "medium", title: `Only ${photos} photo${photos === 1 ? "" : "s"}`,
      plainEnglish: `Only ${photos} photo${photos === 1 ? "" : "s"} visible — add interior, exterior, team, and room/product shots. A fuller gallery (10+), refreshed monthly, lifts calls and direction requests.`,
      fix: `Build the gallery past 10 across interior/exterior/team/product, refreshed monthly.`, effort: "week" });

  // ── Attributes ─────────────────────────────────────────────────────────
  if (p.attributes.totalSet === 0)
    add({ id: "attrs-none", dimension: "Attributes", severity: "medium", title: "No attributes set",
      plainEnglish: `No attributes set (accessibility, parking, payments${p.attributes.isFood ? ", service & dining options" : ", amenities"}) — Google uses these to match you to specific searches and filters.`,
      fix: `Fill payments, accessibility, parking${p.attributes.isFood ? ", and service/dining options" : ", and amenities"} in Google Business Profile.`, effort: "quick" });
  else if (p.attributes.totalSet < 5)
    add({ id: "attrs-thin", dimension: "Attributes", severity: "low", title: `${p.attributes.totalSet} of ~${p.attributes.totalPossible} attributes`,
      plainEnglish: `Only ${p.attributes.totalSet} attributes filled of ~${p.attributes.totalPossible} — adding payments, accessibility, parking${p.attributes.isFood ? ", and service/dining options" : ", and amenities"} widens the searches you appear in.`,
      fix: `Fill the remaining applicable attributes to widen the searches you match.`, effort: "quick" });

  // ── Categories ─────────────────────────────────────────────────────────
  const GENERIC_PRIMARY = new Set(["establishment", "point_of_interest", "premise", "plus_code", "geocode"]);
  if (!p.category)
    add({ id: "cat-none", dimension: "Categories", severity: "critical", title: "No clear primary category",
      plainEnglish: `No clear primary category — the single most important thing telling Google what you do and which searches to show you in.`,
      fix: `Set the most specific primary category that matches your core service — it's the #1 local-ranking lever.`, effort: "quick" });
  else if (p.primaryType && GENERIC_PRIMARY.has(p.primaryType))
    add({ id: "cat-generic", dimension: "Categories", severity: "critical", title: "Primary category is generic",
      plainEnglish: `Your primary category resolves to a generic type ("${p.category}") rather than a specific one — Google can't confidently match a generic listing to the searches your customers actually run, capping your ranking ceiling.`,
      fix: `Switch the primary category to the most specific one that describes your core service — primary category is the #1 local-ranking lever.`, effort: "quick" });
  else if (p.secondaryTypeCount === 0)
    add({ id: "cat-no-secondary", dimension: "Categories", severity: "low", title: "No secondary categories",
      plainEnglish: `Only a primary category, no secondary ones — secondary categories capture adjacent searches you're currently missing.`,
      fix: `Add 2–3 relevant secondary categories to capture adjacent searches.`, effort: "quick" });

  // ── Description ────────────────────────────────────────────────────────
  if (!p.editorialSummary)
    add({ id: "desc-none", dimension: "Description", severity: "low", title: "No description surfaced",
      plainEnglish: `Google isn’t surfacing a description for your profile — strengthen the “from the business” description in Google Business Profile (keyword-aware) and post regularly so Google has your words to rank and quote.`,
      fix: `Write a keyword-aware "from the business" description + a regular Google Post cadence.`, effort: "quick" });

  return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}
