// Sub-niche admission gates for competitor matching (2026-06-14).
//
// The #1 compset bug was sub-niche drift: a yoga_studio entering a fitness_center
// set because similarity was a SOFT types[] Jaccard weight, not a HARD gate. A
// real competitor shares the target's category (or a tight synonym of it) — a
// customer choosing a gym is not choosing a yoga café. This is a binary gate,
// never a weight.
//
// Curated CONSERVATIVELY: too-tight over-splits (gym vs fitness_center are the
// same market), too-loose over-merges (cafe vs restaurant are not). When in
// doubt, keep them separate — a strong co-ranker (Google ranks them together for
// the keyword) bypasses this gate anyway, so the synonym map only needs to catch
// the obvious same-market cases the ranker might miss.

// Each inner array is one market cluster: members are mutually interchangeable.
const SYNONYM_CLUSTERS: string[][] = [
  ["gym", "fitness_center", "physical_fitness_program"],
  ["yoga_studio", "pilates_studio"],
  ["dentist", "dental_clinic", "dental_hygienist"],
  ["doctor", "medical_clinic", "medical_group", "general_practitioner"],
  ["hospital", "medical_lab", "diagnostic_center"],
  ["physiotherapist", "physical_therapist", "rehabilitation_center"],
  ["beauty_salon", "hair_salon", "hair_care", "nail_salon", "barber_shop"],
  ["spa", "wellness_center", "massage", "massage_therapist", "day_spa"],
  ["cafe", "coffee_shop", "cafeteria", "tea_house", "bakery"],
  ["restaurant", "fine_dining_restaurant", "family_restaurant", "fast_food_restaurant",
    "italian_restaurant", "chinese_restaurant", "indian_restaurant", "north_indian_restaurant",
    "south_indian_restaurant", "vegetarian_restaurant", "vegan_restaurant", "seafood_restaurant",
    "pizza_restaurant", "asian_restaurant", "continental_restaurant", "buffet_restaurant",
    "diner", "brunch_restaurant", "barbecue_restaurant", "mexican_restaurant"],
  ["bar", "pub", "bar_and_grill", "wine_bar", "night_club", "lounge"],
  // Lodging is SPLIT by class: a full-service hotel and a hostel/guest house are
  // NOT the same market (a guest cross-shops one or the other). Merging them was
  // why a palace matched a "Family Guest House". See crossClassLodging() below.
  ["hotel", "resort_hotel", "motel", "lodging", "extended_stay_hotel"],
  ["hostel", "guest_house", "bed_and_breakfast", "inn", "budget_japanese_inn"],
  ["travel_agency", "tour_agency", "tour_operator", "travel_agents"],
  ["gym", "boxing_gym", "martial_arts_school"], // combat-fitness adjacency to gym
  ["car_repair", "auto_repair_shop", "car_detailing_service", "auto_body_shop"],
  ["real_estate_agency", "real_estate_agent"],
  ["law_firm", "lawyer", "legal_services"],
  ["school", "preschool", "primary_school", "tutoring_service", "coaching_center"],
  ["clothing_store", "boutique", "fashion_accessories_store"],
  ["jewelry_store", "jeweler"],
];

// Hard NEVER-pair: even if Google co-ranks them oddly, these are different
// markets and must not be peers. Stored as sorted "a|b" keys.
const BANNED_CROSS_PAIRS = new Set<string>(
  [
    ["gym", "cafe"], ["gym", "restaurant"], ["gym", "yoga_studio"], ["gym", "spa"],
    ["restaurant", "cafe"], ["restaurant", "bar"], ["hotel", "restaurant"], ["hotel", "cafe"],
    ["spa", "gym"], ["beauty_salon", "spa"],
    // Event/banquet venues co-rank for "hotel" but aren't room alternatives.
    ["hotel", "banquet_hall"], ["hotel", "wedding_venue"], ["hotel", "event_venue"],
    ["hotel", "convention_center"], ["resort_hotel", "banquet_hall"], ["lodging", "banquet_hall"],
  ].map(([a, b]) => [a, b].sort().join("|")),
);

// The two lodging classes — full-service hotels vs budget lodging. A pairing
// across these is "cross-class" and must not be auto-merged by a co-rank on the
// generic "Hotel" head term (the mechanism that paired a palace with a guest house).
const HOTEL_CLASS = new Set(["hotel", "resort_hotel", "motel", "lodging", "extended_stay_hotel"]);
const BUDGET_LODGING_CLASS = new Set(["hostel", "guest_house", "bed_and_breakfast", "inn", "budget_japanese_inn"]);

/** True when two lodging types sit in DIFFERENT classes (hotel vs budget-lodging).
 *  Used to stop a strong co-ranker from merging a hotel with a hostel/guest house. */
export function crossClassLodging(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return (HOTEL_CLASS.has(a) && BUDGET_LODGING_CLASS.has(b)) || (BUDGET_LODGING_CLASS.has(a) && HOTEL_CLASS.has(b));
}

// Build a fast lookup: primaryType -> the set of types in its cluster(s).
const CLUSTER_OF = new Map<string, Set<string>>();
for (const cluster of SYNONYM_CLUSTERS) {
  for (const t of cluster) {
    const set = CLUSTER_OF.get(t) ?? new Set<string>();
    for (const x of cluster) set.add(x);
    CLUSTER_OF.set(t, set);
  }
}

/** True when two primary types are the same market (identical or same curated
 *  synonym cluster). Null/unknown types → false (let the co-ranking signal or
 *  the caller decide; we never ADMIT on an unknown type via this gate). */
export function sameNiche(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return CLUSTER_OF.get(a)?.has(b) ?? false;
}

/** True when the pair is explicitly banned from ever being peers — overrides a
 *  spurious co-ranking match. */
export function bannedCrossPair(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a === b) return false;
  return BANNED_CROSS_PAIRS.has([a, b].sort().join("|"));
}

export type AdmitResult = { ok: boolean; reason: "off-niche" | null };

/**
 * Hard admission gate for a candidate vs the target. A candidate is admitted if
 * it shares the target's niche, OR Google demonstrably co-ranks them (the ranker
 * is more authoritative than our type map) — UNLESS the pair is explicitly
 * banned. `isStrongCoRanker` = appeared in ≥3 of the keyword probes.
 */
export function admitNiche(
  targetType: string | null,
  candType: string | null,
  isCoRanker: boolean,
  isStrongCoRanker: boolean,
): AdmitResult {
  if (bannedCrossPair(targetType, candType)) return { ok: false, reason: "off-niche" };
  if (sameNiche(targetType, candType)) return { ok: true, reason: null };
  // Cross-class lodging (hotel vs hostel/guest house) is NOT same-niche, and a
  // strong co-rank on the generic "Hotel" head term must NOT merge the classes.
  if (crossClassLodging(targetType, candType)) return { ok: false, reason: "off-niche" };
  // A strong co-ranker bypasses the synonym requirement (Google ranks them
  // together for the head term). A weak/non co-ranker off-niche is rejected.
  if (isStrongCoRanker) return { ok: true, reason: null };
  if (isCoRanker && candType == null) return { ok: true, reason: null }; // co-ranker w/o known type — trust the ranker
  return { ok: false, reason: "off-niche" };
}
