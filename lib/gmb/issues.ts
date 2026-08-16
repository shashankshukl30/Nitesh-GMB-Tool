// GMB issues (consumer-facing, benchmarked), recommendations (specific
// actions), and pitch angles (team-facing).

import type { GmbProfile, GmbScores } from "./types";

export function identifyGmbIssues(p: GmbProfile): string[] {
  const out: string[] = [];
  const count = p.reviewCount ?? 0;
  const ri = p.reviewIntel;

  if (p.businessStatus === "CLOSED_PERMANENTLY")
    out.push(`Google lists this business as PERMANENTLY CLOSED — if that's wrong it is silently killing every search. Fix this first.`);
  else if (p.businessStatus === "CLOSED_TEMPORARILY")
    out.push(`Marked temporarily closed — you're filtered out of "open now" and most local results until cleared.`);

  if (count === 0)
    out.push(`No Google reviews — reviews are the single biggest local-ranking signal. With zero, you're effectively invisible in the local pack.`);
  else if (count < 10)
    out.push(`Only ${count} review${count === 1 ? "" : "s"} — competitors with 50+ outrank you on volume alone.`);
  else if (count < 30)
    out.push(`${count} reviews — a start, but local leaders sit well above 50.`);

  if (p.rating != null && count > 0 && (p.rating < 4.2 || (ri.benchmark && ri.benchmark.includes("below"))))
    out.push(`${p.rating.toFixed(1)}★${ri.benchmark ? ` — ${ri.benchmark}` : " — below the ~4.2 trust threshold most buyers use"}. Profiles under it get skipped even when they rank.`);

  if (ri.sentiment === "negative" && count > 0)
    out.push(`Recent review sentiment skews negative${ri.themes.length ? ` (themes: ${ri.themes.slice(0, 3).join(", ")})` : ""} — reputation work needed before more traffic helps.`);

  if (p.websiteQuality === "none")
    out.push(`No website linked — every visitor who wants to learn more, see a menu, or book has nowhere to go.`);
  else if (p.websiteQuality === "social-only")
    out.push(`Your profile links to a social page, not a real website — you lose SEO, trust, and a proper booking/contact flow.`);
  else if (p.websiteQuality === "free-host")
    out.push(`Your site is on a free template host — slow, generic, and capped on customization. A real domain + fast site lifts trust and ranking.`);

  if (!p.hasHours)
    out.push(`No business hours set — excluded from "open now" results, and visitors can't tell if you're open.`);
  else if (p.daysOpen > 0 && p.daysOpen < 7)
    out.push(`Hours set for only ${p.daysOpen} of 7 days — confirm every day (mark closed days explicitly) so "open now" works correctly.`);

  const photos = p.photoCount ?? 0;
  // Photos array is API-capped at 10 (no true total). Only flag a deficit when
  // the count is genuinely low (below the cap = real count); never claim a
  // shortfall for a capped "10+" gallery we can't actually measure.
  if (photos === 0) out.push(`No photos — profiles with photos get far more calls and direction requests. Visuals are a ranking + trust signal now.`);
  else if (!p.photosCapped && photos < 6) out.push(`Only ${photos} photo${photos === 1 ? "" : "s"} visible — add interior, exterior, team, and room/product shots. A fuller gallery (10+), refreshed monthly, lifts calls and direction requests.`);

  if (p.attributes.totalSet === 0)
    out.push(`No attributes set (accessibility, parking, payments${p.attributes.isFood ? ", service & dining options" : ", amenities"}) — Google uses these to match you to specific searches and filters.`);
  else if (p.attributes.totalSet < 5)
    out.push(`Only ${p.attributes.totalSet} attributes filled of ~${p.attributes.totalPossible} — adding payments, accessibility, parking${p.attributes.isFood ? ", and service/dining options" : ", and amenities"} widens the searches you appear in.`);

  if (!p.category)
    out.push(`No clear primary category — the single most important thing telling Google what you do and which searches to show you in.`);
  else if (p.secondaryTypeCount === 0)
    out.push(`Only a primary category, no secondary ones — secondary categories capture adjacent searches you're currently missing.`);

  if (!p.editorialSummary)
    // editorialSummary is Google's EDITORIAL summary (Google-authored), not the
    // owner's GBP "from the business" field — so phrase this as "Google isn't
    // surfacing one" + the owner-controllable action, never "you have no
    // description" (which would be false for a profile that set its GBP text).
    out.push(`Google isn’t surfacing a description for your profile — strengthen the “from the business” description in Google Business Profile (keyword-aware) and post regularly so Google has your words to rank and quote.`);

  return out.slice(0, 12);
}

export function buildRecommendations(p: GmbProfile): string[] {
  const recs: string[] = [];
  const count = p.reviewCount ?? 0;

  if (count < 50)
    recs.push(`Launch a review-request flow — QR at point of sale + a post-visit WhatsApp/SMS link — to add 5–10 fresh reviews a month.`);
  if (p.rating != null && p.rating < 4.5 && count > 0)
    recs.push(`Reply to every review (good and bad) and resolve the recurring complaints — owner responses + a rising rating lift ranking and conversion.`);
  if (!p.photosCapped && (p.photoCount ?? 0) < 6)
    recs.push(`Build out the photo library across interior, exterior, team, and rooms/products, adding a few fresh ones each month — active galleries outrank stale ones.`);
  if (!p.hasHours || p.daysOpen < 7)
    recs.push(`Set accurate hours for all 7 days (and holiday hours) so you appear in "open now" searches.`);
  if (p.attributes.totalSet < Math.round(p.attributes.totalPossible * 0.4))
    recs.push(`Fill your attributes — ${p.attributes.isFood ? "service & dining options, " : ""}payment methods, accessibility, parking, amenities (currently ${p.attributes.totalSet} of ~${p.attributes.totalPossible}).`);
  if (p.websiteQuality !== "real")
    recs.push(`Link a real, fast website (not a social page or free template) and keep the NAP identical to the profile.`);
  if (!p.category || p.secondaryTypeCount < 2)
    recs.push(`Refine your categories — confirm the most specific primary category and add 2–3 relevant secondary categories.`);
  if (!p.editorialSummary)
    recs.push(`Add a clear, keyword-aware business description and a Google Post cadence (offers/updates) to signal an active profile.`);

  return recs.slice(0, 8);
}

export function identifyGmbAngles(p: GmbProfile, scores: GmbScores): string[] {
  const out: string[] = [`GMB: ${scores.overall}/100${p.category ? ` · ${p.category}` : ""} · resolved by ${p.resolvedBy}.`];
  const count = p.reviewCount ?? 0;
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") out.push(`STATUS: ${p.businessStatus} — urgent, lead with it.`);
  if (count === 0) out.push(`REVIEWS: zero — review-generation system is the headline pitch.`);
  else if (count < 30) out.push(`REVIEWS: only ${count} — velocity + volume retainer hook.`);
  if (p.rating != null && p.rating < 4.3 && count > 0) out.push(`RATING: ${p.rating.toFixed(1)}★${p.reviewIntel.benchmark ? ` (${p.reviewIntel.benchmark})` : ""} — reputation-management angle.`);
  if (p.websiteQuality !== "real") out.push(`WEB: ${p.websiteQuality} — bundle a site build + local SEO.`);
  if (p.attributes.totalSet < 5) out.push(`ATTRIBUTES: ${p.attributes.totalSet}/${p.attributes.totalPossible} — profile-optimization sprint sells itself.`);
  if (!p.photosCapped && (p.photoCount ?? 0) < 5) out.push(`PHOTOS: only ${p.photoCount ?? 0} visible — content cadence is an easy first-month win.`);
  if (scores.overall < 60) out.push(`OVERALL: ${scores.overall} — clear local-SEO retainer case.`);
  return out.slice(0, 8);
}
