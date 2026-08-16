// Franchise dedup + generalized chain detection for the compset (2026-06-14).
//
// Two jobs the old matcher did badly:
//   1. Franchise flooding — 3 Domino's outlets ate a local pizzeria's 4 peer
//      slots (the old code only de-duped by placeId).
//   2. Chain-vs-independent tier — brand-tier.ts only knew HOTEL brands, so the
//      tier signal was inert for fitness/food/beauty/dental. A local
//      independent's peers should skew independent.

// National / well-known chains across verticals (lowercase brand stems). Used
// BOTH to collapse franchise outlets and to flag a candidate as "chain" tier.
// Conservative + extensible; hotel premium brands stay in brand-tier.ts.
const CHAIN_BRANDS = new Set<string>([
  // food / cafe / QSR
  "dominos", "pizza hut", "kfc", "mcdonalds", "burger king", "subway", "starbucks",
  "cafe coffee day", "ccd", "barbeque nation", "barbeque", "haldirams", "haldiram",
  "wow momo", "behrouz", "faasos", "chaayos", "chai point", "third wave", "blue tokai",
  "theobroma", "dunkin", "baskin robbins", "keventers", "social", "the beer cafe",
  // fitness
  "cult", "cultfit", "anytime fitness", "golds gym", "gold s gym", "snap fitness", "talwalkars",
  // beauty / salon
  "lakme", "naturals", "jawed habib", "vlcc", "looks salon", "enrich", "toni guy",
  // grocery / retail
  "reliance", "dmart", "more", "spencers", "vishal", "decathlon", "croma",
  // pharmacy / health
  "apollo", "medplus", "1mg", "wellness forever",
]);

/** Normalize a display name to a brand stem so same-brand outlets collapse.
 *  Drops the location/branch tail (after | - – — , () and common suffixes) and
 *  keeps the leading significant tokens as the brand signature. */
export function brandStem(name: string): string {
  let s = name.toLowerCase().split(/[|(–—\-,:]/)[0] ?? name.toLowerCase();
  s = s.replace(/\b(pvt|ltd|inc|llp|co|the|a|an)\b/g, " ");
  s = s.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** Is this a recognized national/regional chain (so its outlets dedup + it
 *  reads as "chain" tier)? Matches if a known chain token is a prefix of the
 *  normalized stem. */
export function isChain(name: string): boolean {
  const stem = brandStem(name);
  if (!stem) return false;
  for (const c of CHAIN_BRANDS) if (stem === c || stem.startsWith(c + " ") || stem.startsWith(c)) return true;
  return false;
}

/**
 * Collapse franchise outlets to one representative each. CONSERVATIVE: a group
 * of same-stem candidates only collapses when it's a known chain OR the members
 * share a primaryType (so two unrelated "Green …" independents aren't merged).
 * `pick` chooses the survivor (e.g. highest co-rank, else most reviews).
 * Returns the kept list + how many were dropped as duplicate-brand.
 */
export function dedupeFranchises<T extends { name: string; primaryType: string | null }>(
  candidates: T[],
  pick: (a: T, b: T) => T,
): { kept: T[]; droppedBrandDupes: number } {
  const groups = new Map<string, T[]>();
  for (const c of candidates) {
    const stem = brandStem(c.name) || c.name.toLowerCase();
    (groups.get(stem) ?? groups.set(stem, []).get(stem)!).push(c);
  }
  const kept: T[] = [];
  let dropped = 0;
  for (const [stem, group] of groups) {
    if (group.length === 1) { kept.push(group[0]!); continue; }
    const knownChain = CHAIN_BRANDS.has(stem) || [...CHAIN_BRANDS].some((c) => stem.startsWith(c));
    const sameType = group.every((g) => g.primaryType === group[0]!.primaryType);
    if (knownChain || sameType) {
      kept.push(group.reduce((best, g) => pick(best, g)));
      dropped += group.length - 1;
    } else {
      kept.push(...group); // distinct independents that happen to share a stem — keep all
    }
  }
  return { kept, droppedBrandDupes: dropped };
}
