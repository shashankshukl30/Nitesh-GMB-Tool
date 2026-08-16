// Competitor Battlecard — runs the GMB engine on a target business AND its
// prominent local rivals, then builds an honest "where you win / where you
// lose" comparison + team-facing pitch angles.
//
//   input (URL | place-id | name) → target profile → same-category rivals
//   nearby → score everyone → comparison matrix. One Places call for the
//   target, one searchNearby, one rich fetch per rival (parallel). Never throws.
//
// Honesty rules baked in (same discipline as the photo/review fixes):
//   • Photos are API-capped at 10 — a "loss" is only claimed when the target is
//     BELOW the cap and a rival is at/above it (never capped-vs-capped).
//   • A higher star rating on a thin review base is NOT a win — rating gaps are
//     only called when the leader has a credible volume (≥30 reviews).

import { fetchGmbProfile, searchNearbyCompetitors, searchRankedPlaces, type NearbyStub } from "./places";
import { brandTier, type BrandTier } from "./brand-tier";
import { admitNiche, sameNiche } from "./niche-gates";
import { isChain, dedupeFranchises } from "./brand-dedup";
import { computeHotelTier, hotelTier, hotelClassKeyword, isComparableLodging } from "./hotel-tier";
import { detectGmbVertical } from "./analysis";
import { isOverSoftCap, getTodayApiCalls, recordApiCalls } from "@/lib/quota";
import { scoreProfile } from "./scoring";
import type { GmbProfile, GmbScores, Grade } from "./types";

export type BattlecardEntry = {
  profile: GmbProfile;
  scores: GmbScores;
  grade: Grade;
  isTarget: boolean;
  // How many of the keyword co-ranking probes this rival appeared in (0-5),
  // and the one-line "why this is a peer" evidence. Only set for competitors.
  appearanceCount?: number;
  peerEvidence?: string;
  // Tier classification (1 = true peer / "your league", 2 = broader market).
  tier?: 1 | 2;
  tierLabel?: string; // Luxury / Upscale / Midscale / Budget / Hostel-lodge
  tierConfidence?: "high" | "low";
  whyBroader?: string; // for Tier-2: why it's context, not a direct peer
  solv?: number; // this rival's share of local voice (% of probes top-3)
};

export type BattlecardGap = {
  dimension: string;
  targetValue: string;
  leaderName: string;
  leaderValue: string;
  note: string; // human, factual — the sales line
};

export type MarketLeader = {
  name: string;
  reviewCount: number | null;
  rating: number | null;
  // Why it's shown as context, not scored as a peer (different tier).
  note: string;
};

export type BattlecardResult = {
  query: string;
  fetchedAt: string;
  durationMs: number;
  found: boolean;
  reason?: string;
  target: BattlecardEntry | null;
  // Flat list (= [...tier1, ...tier2]) kept for back-compat with ranks/gaps.
  competitors: BattlecardEntry[];
  // Tier 1 = co-ranked AND same-league true peers (the honest benchmark set).
  // Tier 2 = broader market (same area, adjacent tier or not co-ranking).
  tier1: BattlecardEntry[];
  tier2: BattlecardEntry[];
  // Share of local voice: % of successful keyword probes where the TARGET ranked
  // top-3, and the strongest peer (the realistic ceiling in this area).
  targetSolv: number | null;
  ceilingPeer: { name: string; solv: number } | null;
  // Tier distribution of the gated pool ("2 luxury, 5 upscale incl. you, 8 budget").
  tierDistribution: string | null;
  rivalsPicked: number; // rivals selected nearby (some may have failed to fetch)
  ranks: { overall: number; rating: number; reviews: number; total: number } | null;
  losesTo: BattlecardGap[];
  wins: string[];
  pitchAngles: string[];
  // How the peer set was chosen — shown in the UI so the matching is transparent.
  peerBasis: string;
  // The keyword the co-ranking probes used (the business's category) — editable
  // in the UI so the operator can correct intent.
  keyword: string;
  // "co-ranking" = peers Google ranks alongside the target (the true set);
  // "fallback-geometry" = no co-ranking data, closest same-category listings
  // (a weaker match, labeled as such); "none" = no comparable peers found;
  // "unavailable" = we could not READ the market (Places call failed). The
  // last two must never be conflated: "none" is a finding about the client's
  // market, "unavailable" is a finding about our own outage.
  poolSource: "co-ranking" | "fallback-geometry" | "none" | "unavailable";
  // How many candidates were excluded by the gates (off-niche / out-of-league /
  // duplicate brand) — shown so "only N peers" reads as rigor, not a bug.
  rejectedCount: number;
  // The area's overall leader when it's a DIFFERENT tier than the target
  // (much bigger / pricier) — surfaced as honest context, not a scored peer.
  marketLeader: MarketLeader | null;
};

const TIER1_MAX = 5; // closest true peers ("your league")
const TOTAL_MAX = 10; // tier1 + tier2 — the STR compset standard (5-10)

// A unified candidate: a nearby stub (full fields) OR a co-ranking-only entry
// (Google ranks it for the keyword but it's outside the geometric pool, so only
// id+name+appearanceCount are known until the survivor detail-fetch).
type Candidate = {
  placeId: string;
  name: string;
  primaryType: string | null;
  reviewCount: number | null;
  rating: number | null;
  lat: number | null;
  lng: number | null;
  types: string[];
  businessStatus: string | null;
  priceLevel: number | null;
  appearanceCount: number; // 0-5, how many keyword probes ranked it
  bestRank: number | null; // best probe rank (1 = top), for SoLV
  top3: number; // probes where it ranked top-3 (for SoLV)
  band: number; // inferred tier band 0-4 (computeHotelTier on the stub)
  bandConfidence: "high" | "low";
  tier?: 1 | 2; // assigned during bucketing
};

// Generic Google types that say nothing about the competitive set.
const GENERIC_TYPES = new Set(["point_of_interest", "establishment", "food", "store", "place_of_worship", "tourist_attraction"]);

// 1 - Jaccard over the meaningful type sets. 0 = identical service mix, 1 =
// disjoint. A tie-breaker only (the niche GATE handles category identity).
function typesDistance(a: string[], b: string[]): number {
  const sa = new Set(a.filter((t) => !GENERIC_TYPES.has(t)));
  const sb = new Set(b.filter((t) => !GENERIC_TYPES.has(t)));
  if (sa.size === 0 || sb.size === 0) return 0.5;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0.5 : 1 - inter / union;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Tie-break weights — applied ONLY among already-admitted same-niche, in-league
// candidates to order them. The hard work (who's a peer at all) is done by the
// niche + league gates + co-ranking; these just sort the survivors. Lower = closer.
const CHAIN_W = 1.2;      // crossing chain ↔ independent (generalized past hotels)
const DIST_W = 0.7;       // vicinity, bucketed
const RATING_W = 0.5;     // quality proximity
const REVIEWPROX_W = 0.4; // review closeness within-league
const TYPES_W = 0.3;      // service-mix fine-tune
const PRICE_W = 1.0;      // price tier when present (food/retail; null for hotels)

function tieBreakScore(target: GmbProfile, targetTier: BrandTier, c: Candidate): number {
  let distTerm = 0.5;
  if (target.lat != null && target.lng != null && c.lat != null && c.lng != null) {
    const km = haversineKm(target.lat, target.lng, c.lat, c.lng);
    distTerm = km < 2 ? 0 : km < 5 ? 0.5 : 1; // hyperlocal buckets, not linear /5km
  }
  const ratingTerm = target.rating != null && c.rating != null ? Math.abs(c.rating - target.rating) : 0.4;
  const reviewProx = target.reviewCount && c.reviewCount
    ? Math.min(1, Math.abs(Math.log10((c.reviewCount + 1) / (target.reviewCount + 1))))
    : 0.5;
  const typesTerm = c.types.length ? typesDistance(target.types, c.types) : 0.5;
  // Generalized chain tier: hotels via brandTier(premium), others via isChain().
  const targetChain = targetTier === "premium" || isChain(target.name);
  const candChain = brandTier(c.name) === "premium" || isChain(c.name);
  const chainTerm = targetChain !== candChain ? 1 : 0;
  const priceTerm = target.priceLevel != null && c.priceLevel != null ? Math.abs(c.priceLevel - target.priceLevel) : 0;
  return CHAIN_W * chainTerm + DIST_W * distTerm + RATING_W * ratingTerm + REVIEWPROX_W * reviewProx + TYPES_W * typesTerm + PRICE_W * priceTerm;
}

// Intent-overlap pool: who Google ACTUALLY ranks for the business's keyword,
// across the target point + 4 offsets (~1.2km N/S/E/W). The authoritative
// "businesses a customer chooses between" signal — and the structural cure for
// sub-niche drift (a yoga café won't rank for "gym"). 5 cheap Essentials-SKU
// calls. A null probe = FAILED (never counted as absence — honesty rule).
type CoRankTally = { count: number; name: string; bestRank: number; top3: number };
async function coRankPool(center: { lat: number; lng: number }, keyword: string): Promise<{ tally: Map<string, CoRankTally>; probesOk: number }> {
  const dLat = 1.2 / 111;
  const dLng = 1.2 / (111 * Math.cos((center.lat * Math.PI) / 180));
  const probes = [
    center,
    { lat: center.lat + dLat, lng: center.lng },
    { lat: center.lat - dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng + dLng },
    { lat: center.lat, lng: center.lng - dLng },
  ];
  const tally = new Map<string, CoRankTally>();
  const results = await Promise.all(probes.map((p) => searchRankedPlaces(p, keyword, { radiusM: 1500, limit: 20 }).catch(() => null)));
  let probesOk = 0;
  for (const res of results) {
    if (!res) continue; // failed probe — NOT an absence (kept out of the SoLV denominator)
    probesOk += 1;
    res.forEach((r, idx) => {
      const rank = idx + 1;
      const cur = tally.get(r.id);
      if (cur) { cur.count += 1; cur.bestRank = Math.min(cur.bestRank, rank); if (rank <= 3) cur.top3 += 1; }
      else tally.set(r.id, { count: 1, name: r.name, bestRank: rank, top3: rank <= 3 ? 1 : 0 });
    });
  }
  return { tally, probesOk };
}

const TIER_NAMES = ["hostel/lodge", "budget", "midscale", "upscale", "luxury"];

/** One-line, evidence-cited "why this is a peer" — cites tier match + co-ranking. */
function buildPeerEvidence(target: GmbProfile, c: Candidate, profile: GmbProfile, isLodging: boolean, targetBand: number, candBand: number): string {
  const parts: string[] = [];
  if (isLodging && Math.abs(candBand - targetBand) <= 1) parts.push(`same tier (${TIER_NAMES[candBand]})`);
  if (c.appearanceCount >= 2) parts.push(`co-ranks with you at ${c.appearanceCount}/5 nearby search points`);
  if (!isLodging && sameNiche(target.primaryType, profile.primaryType)) parts.push("same category");
  const tr = target.reviewCount ?? 0, cr = profile.reviewCount ?? 0;
  if (tr > 0 && cr > 0) parts.push(cr >= tr ? `${(cr / tr).toFixed(1)}× your reviews` : `${(tr / cr).toFixed(1)}× fewer reviews`);
  if (!parts.length) parts.push("closest same-category listing nearby");
  return parts.join(" · ");
}

/** Why a Tier-2 entry is context, not a direct peer (size/tier/co-rank reason). */
function buildWhyBroader(target: GmbProfile, c: Candidate, isLodging: boolean, targetBand: number, candBand: number): string {
  const tr = target.reviewCount ?? 0, cr = c.reviewCount ?? 0;
  if (isLodging && Math.abs(candBand - targetBand) >= 2) return `${TIER_NAMES[candBand]} tier vs your ${TIER_NAMES[targetBand]} — an adjacent class, not a direct peer`;
  if (c.appearanceCount < 2) return `same area & category but doesn't co-rank with you for "${TIER_NAMES[targetBand]}" searches`;
  if (tr > 0 && cr > 0 && cr / tr >= 4) return `~${(cr / tr).toFixed(0)}× your review base — a size up, broader-market context`;
  return `nearby in your category — broader-market context`;
}

export async function runBattlecard(input: string, opts?: { max?: number; keyword?: string }): Promise<BattlecardResult> {
  const startedAt = Date.now();
  const q = input.trim();
  const base = (found: boolean, extra: Partial<BattlecardResult>): BattlecardResult => ({
    query: q, fetchedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    found, target: null, competitors: [], tier1: [], tier2: [], rivalsPicked: 0, ranks: null,
    losesTo: [], wins: [], pitchAngles: [], peerBasis: "", keyword: "", poolSource: "none",
    rejectedCount: 0, marketLeader: null, targetSolv: null, ceilingPeer: null, tierDistribution: null, ...extra,
  });

  const target = await fetchGmbProfile(q);
  if (!target.found) return base(false, { reason: target.reason });

  const targetEntry = entryOf(target, true);

  let competitors: BattlecardEntry[] = [];
  let tier1: BattlecardEntry[] = [];
  let tier2: BattlecardEntry[] = [];
  let rivalsPicked = 0;
  let peerBasis = "";
  let marketLeader: MarketLeader | null = null;
  let keyword = "";
  let poolSource: "co-ranking" | "fallback-geometry" | "none" | "unavailable" = "none";
  let poolUnavailable = false;
  let rejectedCount = 0;
  let targetSolv: number | null = null;
  let ceilingPeer: { name: string; solv: number } | null = null;
  let tierDistribution: string | null = null;

  if (target.lat != null && target.lng != null && target.primaryType) {
    const center = { lat: target.lat, lng: target.lng };
    const vertical = detectGmbVertical(target.primaryType, target.category, target.types);
    const isLodging = vertical.vertical === "hotel";
    const targetBand = hotelTier(target); // tier band of the target (lodging-meaningful)
    const targetReviews = target.reviewCount ?? 0;
    const targetBrand = brandTier(target.name);

    // GEOMETRIC RECALL pool — closest (5km) + most-prominent (8km) same-type listings.
    //
    // null = the Places call FAILED (already Sentry-captured); [] = Google
    // genuinely returned no same-type businesses nearby. If BOTH probes failed
    // we know nothing about this market, and must not render the "thin
    // competitive band" verdict — that would be a false claim about a paying
    // client's competition caused by our own outage.
    const [distPool, popPool] = await Promise.all([
      searchNearbyCompetitors(center, target.primaryType, { max: 20, rankBy: "DISTANCE", radiusM: 5000 }),
      searchNearbyCompetitors(center, target.primaryType, { max: 20, rankBy: "POPULARITY", radiusM: 8000 }),
    ]);
    poolUnavailable = distPool === null && popPool === null;
    const seenStub = new Set<string>();
    const stubs = [...(distPool ?? []), ...(popPool ?? [])].filter(
      (s) => s.placeId && s.placeId !== target.placeId && !seenStub.has(s.placeId) && seenStub.add(s.placeId),
    );

    // INTENT-OVERLAP pool, probed with a TIER-QUALIFIED + locality keyword so the
    // co-rank pool is pre-filtered to the right CLASS instead of "everything that
    // ranks for Hotel" (the root cause of tier-mixing). Soft-cap gated.
    keyword = (opts?.keyword
      ?? (isLodging ? `${hotelClassKeyword(targetBand)}${target.city ? " " + target.city : ""}` : (target.category ?? target.primaryType))
    ).replace(/_/g, " ").trim();
    let coRank = new Map<string, CoRankTally>();
    let probesOk = 0;
    let targetTally: CoRankTally | undefined;
    if (keyword && !isOverSoftCap(getTodayApiCalls())) {
      const r = await coRankPool(center, keyword).catch(() => ({ tally: new Map<string, CoRankTally>(), probesOk: 0 }));
      coRank = r.tally; probesOk = r.probesOk;
      recordApiCalls(5);
      if (target.placeId) { targetTally = coRank.get(target.placeId); coRank.delete(target.placeId); }
    }
    targetSolv = probesOk > 0 ? Math.round((100 * (targetTally?.top3 ?? 0)) / probesOk) : null;

    // UNIFY — stubs annotated with co-ranking + tier band; plus co-rankers outside
    // the geometric pool (Google ranks them → real peers; band from name only).
    const byId = new Map<string, Candidate>();
    const candFrom = (placeId: string, name: string, stub: NearbyStub | null, cr: CoRankTally | undefined): Candidate => {
      const t = computeHotelTier(name, stub?.reviewCount ?? null);
      return {
        placeId, name,
        primaryType: stub?.primaryType ?? null, reviewCount: stub?.reviewCount ?? null, rating: stub?.rating ?? null,
        lat: stub?.lat ?? null, lng: stub?.lng ?? null, types: stub?.types ?? [], businessStatus: stub?.businessStatus ?? null,
        priceLevel: stub?.priceLevel ?? null, appearanceCount: cr?.count ?? 0, bestRank: cr?.bestRank ?? null,
        top3: cr?.top3 ?? 0, band: t.band, bandConfidence: t.confidence,
      };
    };
    for (const s of stubs) byId.set(s.placeId, candFrom(s.placeId, s.name, s, coRank.get(s.placeId)));
    for (const [id, cr] of coRank) {
      if (id === target.placeId || byId.has(id)) continue;
      byId.set(id, candFrom(id, cr.name, null, cr));
    }

    // HARD GATES (applied to EVERY candidate, co-ranking can NOT bypass tier/league):
    const reviewBandDist = (c: Candidate) => Math.abs(Math.log10(((c.reviewCount ?? 0) + 1) / (targetReviews + 1)));
    const classGapOf = (c: Candidate) => Math.abs(c.band - targetBand.band);
    let rejOffNiche = 0, rejLeague = 0, rejNonPeer = 0;
    const outOfLeague: Candidate[] = [];
    const admitted = [...byId.values()].filter((c) => {
      if (c.businessStatus === "CLOSED_PERMANENTLY" || c.businessStatus === "CLOSED_TEMPORARILY") return false;
      const isCoRanker = c.appearanceCount >= 2;
      const isStrong = c.appearanceCount >= 3;
      if (!admitNiche(target.primaryType, c.primaryType, isCoRanker, isStrong).ok) { rejOffNiche++; return false; }
      // Exclusion co-ranking can't bypass — hostels/banquet/landmark for lodging.
      if (isLodging && !isComparableLodging(c.primaryType, c.name)) { rejNonPeer++; return false; }
      // Review-league gate for ALL (was unreachable for co-rankers before). >10× the
      // target's review base (when both credible) → not a peer; the giants → marketLeader.
      if (targetReviews >= 25 && (c.reviewCount ?? 0) >= 25 && reviewBandDist(c) > 1.0) { outOfLeague.push(c); rejLeague++; return false; }
      return true;
    });

    // FRANCHISE DEDUP.
    const { kept, droppedBrandDupes } = dedupeFranchises(admitted, (a, b) => {
      if (a.appearanceCount !== b.appearanceCount) return a.appearanceCount > b.appearanceCount ? a : b;
      return (a.reviewCount ?? 0) >= (b.reviewCount ?? 0) ? a : b;
    });
    rejectedCount = rejOffNiche + rejLeague + rejNonPeer + droppedBrandDupes;

    // BUCKET. Tier 1 = co-ranked AND within ~4× review base AND same tier band.
    // Tier 2 = the broader market (passed gates, missed a Tier-1 condition).
    const classSlack = targetBand.confidence === "low" ? 2 : 1; // widen when tier is unproven
    const tier1Eligible = (c: Candidate) =>
      c.appearanceCount >= 2 && reviewBandDist(c) <= 0.6 && (!isLodging || classGapOf(c) <= classSlack);
    const t1c: Candidate[] = [], t2c: Candidate[] = [];
    for (const c of kept) (tier1Eligible(c) ? t1c : t2c).push(c);
    t1c.sort((a, b) => b.appearanceCount - a.appearanceCount || tieBreakScore(target, targetBrand, a) - tieBreakScore(target, targetBrand, b));
    t2c.sort((a, b) => b.appearanceCount - a.appearanceCount || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    const picked1 = t1c.slice(0, TIER1_MAX).map((c) => ({ ...c, tier: 1 as const }));
    const picked2 = t2c.slice(0, Math.max(0, TOTAL_MAX - picked1.length)).map((c) => ({ ...c, tier: 2 as const }));
    const picked = [...picked1, ...picked2];

    // Market-leader context — the biggest out-of-league giant (>10× the base).
    const giant = outOfLeague.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0]
      ?? [...stubs].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0];
    if (giant && (giant.reviewCount ?? 0) >= Math.max(200, targetReviews * 5) && !picked.some((p) => p.placeId === giant.placeId)) {
      marketLeader = {
        name: giant.name, reviewCount: giant.reviewCount, rating: giant.rating,
        note: `${giant.name} leads the wider area (${(giant.reviewCount ?? 0).toLocaleString()} reviews) but sits in a different tier — context for the market, not a direct peer of ${target.name}.`,
      };
    }

    // Detail-fetch the survivors (gated fan-out ~10), drop closed/not-found.
    const fetched = await Promise.all(picked.map(async (c) => ({ c, profile: await fetchGmbProfile(c.placeId) })));
    const built = fetched
      .filter((x) => x.profile.found && x.profile.businessStatus !== "CLOSED_PERMANENTLY" && x.profile.businessStatus !== "CLOSED_TEMPORARILY")
      .map((x) => {
        const e = entryOf(x.profile, false);
        const realTier = isLodging ? hotelTier(x.profile) : { band: x.c.band, confidence: x.c.bandConfidence, tierLabel: "" };
        e.appearanceCount = x.c.appearanceCount;
        e.tier = x.c.tier;
        e.tierLabel = isLodging ? realTier.tierLabel : undefined;
        e.tierConfidence = realTier.confidence;
        e.solv = probesOk > 0 ? Math.round((100 * x.c.top3) / probesOk) : undefined;
        e.peerEvidence = buildPeerEvidence(target, x.c, x.profile, isLodging, targetBand.band, realTier.band);
        if (x.c.tier === 2) e.whyBroader = buildWhyBroader(target, x.c, isLodging, targetBand.band, realTier.band);
        return e;
      });
    tier1 = built.filter((e) => e.tier === 1);
    tier2 = built.filter((e) => e.tier === 2);
    competitors = [...tier1, ...tier2];
    // picked.length, NOT competitors.length. competitors is the POST-filter
    // array (rivals whose detail-fetch failed have already been dropped), so
    // assigning from it made rivalsPicked === competitors.length by
    // construction — which silently disabled the "(N more nearby couldn't be
    // read)" disclosure in battlecard-view.tsx that exists precisely to admit
    // a partial peer set. A quota-throttled fan-out used to shrink the set
    // with the client told nothing.
    rivalsPicked = picked.length;

    // SoLV ceiling — strongest peer's share of local voice.
    const ceil = built.filter((e) => e.solv != null).sort((a, b) => (b.solv ?? 0) - (a.solv ?? 0))[0];
    if (ceil && (ceil.solv ?? 0) > (targetSolv ?? 0)) ceilingPeer = { name: ceil.profile.name, solv: ceil.solv! };

    // Tier distribution of the gated pool (lodging only — needs honest bands).
    if (isLodging && kept.length) {
      const buckets = [0, 0, 0, 0, 0];
      buckets[targetBand.band] += 1; // include the target ("incl. you")
      for (const c of kept) buckets[c.band] += 1;
      const names = ["hostel/lodge", "budget", "midscale", "upscale", "luxury"];
      tierDistribution = buckets
        .map((n, i) => (n > 0 ? `${n} ${names[i]}${i === targetBand.band ? " (incl. you)" : ""}` : null))
        .filter(Boolean).reverse().join(" · ");
    }

    const coRankerCount = picked.filter((c) => c.appearanceCount >= 2).length;
    poolSource = competitors.length === 0
      ? (poolUnavailable ? "unavailable" : "none")
      : coRankerCount > 0 ? "co-ranking" : "fallback-geometry";
    peerBasis = poolSource === "unavailable"
      // We could not read the market. Say THAT — do not claim the client has
      // no competition, which is what an empty pool used to render as.
      ? `Couldn't read the local market from Google just now — this is our fetch failing, not a finding about your competition. Re-run in a minute.`
      : competitors.length === 0
      ? (keyword ? `No businesses co-rank with you for "${keyword}" nearby in your tier — a genuinely thin competitive band.` : "")
      : poolSource === "co-ranking"
        ? `Tier 1 = businesses Google ranks alongside you for "${keyword}" that are in your league (tier + review base). Tier 2 = the broader nearby market.${tier1.length < 3 ? ` Only ${tier1.length} true peer${tier1.length === 1 ? "" : "s"} in your tier nearby.` : ""}`
        : `No co-ranking data nearby — showing the closest same-category, same-league listings (a weaker match).`;
  }

  const ranks = tier1.length ? computeRanks(targetEntry, tier1) : (competitors.length ? computeRanks(targetEntry, competitors) : null);
  const losesTo = tier1.length ? findGaps(targetEntry, tier1) : [];
  const wins = tier1.length ? findWins(targetEntry, tier1) : [];
  const pitchAngles = buildAngles(targetEntry, tier1.length ? tier1 : competitors, ranks, losesTo, marketLeader);

  return base(true, {
    target: targetEntry, competitors, tier1, tier2, rivalsPicked, ranks, losesTo, wins, pitchAngles,
    peerBasis, keyword, poolSource, rejectedCount, marketLeader, targetSolv, ceilingPeer, tierDistribution,
  });
}

function entryOf(profile: GmbProfile, isTarget: boolean): BattlecardEntry {
  const { scores, grade } = scoreProfile(profile);
  return { profile, scores, grade, isTarget };
}

// Photos comparison value: capped (10+) sorts as effectively unbounded so two
// full galleries tie rather than one falsely "beating" the other.
const photoVal = (p: GmbProfile) => (p.photosCapped ? 10_000 : p.photoCount ?? 0);
const webRank = (q: GmbProfile["websiteQuality"]) => (q === "real" ? 3 : q === "free-host" ? 2 : q === "social-only" ? 1 : 0);

function computeRanks(target: BattlecardEntry, competitors: BattlecardEntry[]) {
  const all = [target, ...competitors];
  const rank = (val: (e: BattlecardEntry) => number) => 1 + all.filter((e) => val(e) > val(target)).length;
  return {
    overall: rank((e) => e.scores.overall),
    rating: rank((e) => e.profile.rating ?? 0),
    reviews: rank((e) => e.profile.reviewCount ?? 0),
    total: all.length,
  };
}

function leaderBy(all: BattlecardEntry[], val: (e: BattlecardEntry) => number): BattlecardEntry {
  return all.reduce((best, e) => (val(e) > val(best) ? e : best), all[0]!);
}

function findGaps(target: BattlecardEntry, competitors: BattlecardEntry[]): BattlecardGap[] {
  const all = [target, ...competitors];
  const t = target.profile;
  const gaps: BattlecardGap[] = [];

  // Overall GMB health — gap ≥ 8 points.
  const oLeader = leaderBy(all, (e) => e.scores.overall);
  if (!oLeader.isTarget && oLeader.scores.overall - target.scores.overall >= 8) {
    gaps.push({ dimension: "Overall GMB health", targetValue: `${target.scores.overall}/100`, leaderName: oLeader.profile.name, leaderValue: `${oLeader.scores.overall}/100`,
      note: `${oLeader.profile.name} runs a healthier profile (${oLeader.scores.overall} vs your ${target.scores.overall}).` });
  }

  // Review volume — leader has ≥1.5× and ≥50 more reviews.
  const rLeader = leaderBy(all, (e) => e.profile.reviewCount ?? 0);
  const tc = t.reviewCount ?? 0, lc = rLeader.profile.reviewCount ?? 0;
  if (!rLeader.isTarget && lc >= 50 && lc >= tc * 1.5) {
    const mult = tc > 0 ? `${(lc / tc).toFixed(1)}× your volume` : `you have ${tc}`;
    gaps.push({ dimension: "Review volume", targetValue: tc.toLocaleString(), leaderName: rLeader.profile.name, leaderValue: lc.toLocaleString(),
      note: `${rLeader.profile.name} has ${lc.toLocaleString()} reviews — ${mult}. Review volume is the biggest local-pack signal.` });
  }

  // Star rating — only when the leader has a CREDIBLE base (≥30 reviews) and the gap is ≥0.2★.
  const ratedRivals = competitors.filter((e) => (e.profile.reviewCount ?? 0) >= 30 && e.profile.rating != null);
  if (t.rating != null && ratedRivals.length) {
    const rl = leaderBy([target, ...ratedRivals], (e) => e.profile.rating ?? 0);
    if (!rl.isTarget && (rl.profile.rating ?? 0) - t.rating >= 0.2) {
      gaps.push({ dimension: "Star rating", targetValue: `${t.rating.toFixed(1)}★`, leaderName: rl.profile.name, leaderValue: `${rl.profile.rating!.toFixed(1)}★ (${(rl.profile.reviewCount ?? 0).toLocaleString()})`,
        note: `${rl.profile.name} holds ${rl.profile.rating!.toFixed(1)}★ across ${(rl.profile.reviewCount ?? 0).toLocaleString()} reviews vs your ${t.rating.toFixed(1)}★ — a reputation gap buyers see first.` });
    }
  }

  // Photos — only when the TARGET is below the API cap and a rival is at/above it.
  if (!t.photosCapped) {
    const pLeader = leaderBy(all, (e) => photoVal(e.profile));
    if (!pLeader.isTarget && photoVal(pLeader.profile) > photoVal(t)) {
      gaps.push({ dimension: "Photos", targetValue: `${t.photoCount ?? 0}`, leaderName: pLeader.profile.name, leaderValue: pLeader.profile.photosCapped ? "10+" : `${pLeader.profile.photoCount ?? 0}`,
        note: `${pLeader.profile.name} shows a fuller photo gallery — visuals drive calls and direction requests.` });
    }
  }

  // Website — target lacks a real site, a rival has one.
  if (webRank(t.websiteQuality) < 3) {
    const wLeader = competitors.find((e) => e.profile.websiteQuality === "real");
    if (wLeader) {
      gaps.push({ dimension: "Website", targetValue: t.websiteQuality === "none" ? "none" : t.websiteQuality, leaderName: wLeader.profile.name, leaderValue: "real site",
        note: `${wLeader.profile.name} links a real website while you ${t.websiteQuality === "none" ? "link none" : `rely on a ${t.websiteQuality} link`} — lost trust, SEO, and booking flow.` });
    }
  }

  // Primary category — the #1 local-ranking lever, and previously never
  // compared. If the MODAL primary category across the peer set differs from
  // the target's, the target may be mis-categorized — a category change can lift
  // ranking more than any content work. Only assert when several peers agree
  // (≥2 and ≥half) so a single odd rival can't fabricate a gap.
  if (t.primaryType) {
    const counts = new Map<string, number>();
    for (const e of competitors) { const ct = e.profile.primaryType; if (ct) counts.set(ct, (counts.get(ct) ?? 0) + 1); }
    let modal: string | null = null, modalN = 0;
    for (const [c, n] of counts) if (n > modalN) { modal = c; modalN = n; }
    if (modal && modal !== t.primaryType && modalN >= Math.max(2, Math.ceil(competitors.length / 2))) {
      const modalDisplay = competitors.find((e) => e.profile.primaryType === modal)?.profile.category ?? modal.replace(/_/g, " ");
      const yourDisplay = t.category ?? t.primaryType.replace(/_/g, " ");
      gaps.push({ dimension: "Primary category", targetValue: yourDisplay, leaderName: `${modalN} of ${competitors.length} peers`, leaderValue: modalDisplay,
        note: `${modalN} of your ${competitors.length} ranking peers list under "${modalDisplay}" while you use "${yourDisplay}" — primary category is the #1 local-ranking lever, and a mismatch can quietly cap your visibility for the searches that matter.` });
    }
  }

  return gaps.slice(0, 6);
}

function findWins(target: BattlecardEntry, competitors: BattlecardEntry[]): string[] {
  const all = [target, ...competitors];
  const t = target.profile;
  const wins: string[] = [];
  const best = (val: (e: BattlecardEntry) => number) => leaderBy(all, val).isTarget;

  if (best((e) => e.scores.overall)) wins.push(`Healthiest overall profile in the local set (${target.scores.overall}/100).`);
  if (best((e) => e.profile.reviewCount ?? 0) && (t.reviewCount ?? 0) > 0) wins.push(`Most-reviewed of the set (${(t.reviewCount ?? 0).toLocaleString()} reviews).`);
  // Rating win only counts if the target itself has a credible base. Word it
  // honestly: "among rivals with real volume" ONLY if a rival actually has
  // >=30 reviews to be compared against — otherwise it's just "top-rated".
  if ((t.reviewCount ?? 0) >= 30 && best((e) => ((e.profile.reviewCount ?? 0) >= 30 ? e.profile.rating ?? 0 : 0)) && t.rating != null) {
    const ratedRivals = competitors.some((e) => (e.profile.reviewCount ?? 0) >= 30);
    wins.push(ratedRivals ? `Top star rating among rivals with real volume (${t.rating.toFixed(1)}★).` : `Highest-rated in the set with a credible review base (${t.rating.toFixed(1)}★).`);
  }
  if (t.photosCapped && !competitors.every((e) => e.profile.photosCapped)) wins.push(`Full photo gallery where some rivals are thin.`);
  if (t.websiteQuality === "real" && competitors.some((e) => e.profile.websiteQuality !== "real")) wins.push(`Real website where rivals lean on social/none.`);

  return wins.slice(0, 4);
}

function buildAngles(target: BattlecardEntry, competitors: BattlecardEntry[], ranks: BattlecardResult["ranks"], losesTo: BattlecardGap[], marketLeader: MarketLeader | null): string[] {
  if (!competitors.length) return [`No same-category rivals returned by Google near this location — competitor discovery needs a filterable primary type + coordinates.`];
  const out: string[] = [];
  if (ranks) out.push(`Position: #${ranks.overall} of ${ranks.total} on overall GMB health, #${ranks.reviews} of ${ranks.total} on review volume — among TIER PEERS, not the area's biggest names.`);
  const strongest = leaderBy([target, ...competitors], (e) => e.scores.overall);
  if (!strongest.isTarget) out.push(`Top peer: ${strongest.profile.name} (${strongest.scores.overall}/100, ${(strongest.profile.reviewCount ?? 0).toLocaleString()} reviews) — the realistic business to benchmark against.`);
  if (marketLeader) out.push(`Context (not a peer): ${marketLeader.note} Don't anchor the pitch on catching them — anchor on out-executing your tier.`);
  if (losesTo[0]) out.push(`Lead the pitch with: ${losesTo[0].note}`);
  // Bundling hook when multiple gaps stack.
  const dims = new Set(losesTo.map((g) => g.dimension));
  if (dims.has("Review volume") && (dims.has("Photos") || dims.has("Website"))) out.push(`Multiple stacked gaps → pitch a full local-SEO retainer (reviews + content + ${dims.has("Website") ? "site build" : "photo cadence"}), not a one-off.`);
  if (!losesTo.length) out.push(`Target already leads the local set — angle is "defend the lead": review cadence + profile freshness to stay ahead.`);
  return out.slice(0, 6);
}
