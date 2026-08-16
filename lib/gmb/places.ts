// Places API (New) fetcher for the god-tier GMB tool.
//
// Resolves the input to an EXACT listing (place-id / URL coords / name), then
// pulls a rich field set — category, NAP, hours, reviews, photos, structured
// attributes (accessibility / parking / payments / service & dining options /
// amenities), price range, AI review summary. No SSRF (fixed Google endpoint).

import { logError } from "../log";
import type { GmbAttributes, GmbProfile, GmbReview } from "./types";
import { resolvePlaceRef } from "./resolve";
import { websiteQuality, countDaysOpen, daysOpenFromPeriods, computeReviewIntel, isFoodBusiness } from "./analysis";

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places/"; // + {placeId}

// Rich field mask (Enterprise + Atmosphere + Reviews SKU). Every name is a
// documented Places API (New) field. `reviewSummary` is the AI summary — if a
// region/account can't serve it, Google omits it (it won't 400).
// Places API (New) returns at most this many photo references per place, with
// no field for the true total. 10 returned ⇒ "10 or more" (real count unknown).
const PHOTO_CAP = 10;

// One-flip kill for ALL Places spend (GMB tool + rank grid + nearby search),
// independent of the GCP master switch — Places bills on GOOGLE_PLACES_API_KEY,
// a separate budget from the GCP trial, and that master switch defaults OFF
// (which must NOT disable Places). Set PLACES_DISABLED=1 at trial/budget expiry:
// every entry point then sees "no key" and routes through its existing graceful
// degrade (profile → NOT_FOUND, nearby → [], rank cell → null/no-data). See
// OPERATIONS.md → "Disabling Google APIs at trial expiry".
function placesApiKey(): string | undefined {
  if (process.env.PLACES_DISABLED === "1") return undefined;
  return process.env.GOOGLE_PLACES_API_KEY?.trim();
}

const SEARCH_FIELDS = [
  "id", "displayName", "formattedAddress", "addressComponents", "location", "types", "primaryType",
  "primaryTypeDisplayName", "businessStatus", "nationalPhoneNumber",
  "internationalPhoneNumber", "websiteUri", "googleMapsUri", "googleMapsLinks",
  "rating", "userRatingCount", "priceLevel", "priceRange", "photos",
  "regularOpeningHours", "currentOpeningHours", "reviews", "reviewSummary",
  "editorialSummary", "accessibilityOptions", "parkingOptions", "paymentOptions",
  "dineIn", "takeout", "delivery", "curbsidePickup", "reservable",
  "servesBreakfast", "servesLunch", "servesDinner", "servesBrunch",
  "servesVegetarianFood", "servesCoffee", "servesDessert", "servesBeer",
  "servesWine", "servesCocktails", "outdoorSeating", "restroom",
  "goodForChildren", "menuForChildren", "goodForGroups", "goodForWatchingSports",
  "allowsDogs", "liveMusic",
];
const FIELD_MASK_SEARCH = SEARCH_FIELDS.map((f) => `places.${f}`).join(",");
const FIELD_MASK_DETAILS = SEARCH_FIELDS.join(",");

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type RawPlace = any;

const NOT_FOUND = (reason: string): GmbProfile => ({
  found: false, reason, placeId: null, resolvedBy: "name", name: "", category: null,
  primaryType: null, secondaryTypeCount: 0, types: [], address: null, city: null, phone: null,
  website: null, websiteQuality: "none", googleMapsUri: null, writeReviewUri: null,
  rating: null, reviewCount: null, priceLevel: null, priceRange: null, photoCount: null,
  photosCapped: false, businessStatus: null, hasHours: false, weekdayHours: [], daysOpen: 0,
  hasSpecialHours: false, openNow: null, editorialSummary: null, reviewSummary: null,
  attributes: { accessibility: [], parking: [], payments: [], serviceOptions: [], dining: [], amenities: [], isFood: false, totalSet: 0, totalPossible: 21 },
  hasAccessibility: false, lat: null, lng: null, reviews: [],
  reviewIntel: { sentiment: "unknown", positiveShare: null, themes: [], praisedThemes: [], flaggedThemes: [], benchmark: null },
});

export async function fetchGmbProfile(input: string): Promise<GmbProfile> {
  const apiKey = placesApiKey();
  if (!apiKey) return NOT_FOUND("Places API key not configured.");

  const ref = await resolvePlaceRef(input);
  if (ref.kind === "placeId") return fetchByPlaceId(ref.placeId, apiKey);
  const bias = ref.kind === "textWithBias" ? { lat: ref.lat, lng: ref.lng } : undefined;
  return searchPlace(ref.text, apiKey, bias, ref.kind === "textWithBias" ? "url-coords" : "name");
}

async function searchPlace(
  text: string,
  apiKey: string,
  bias: { lat: number; lng: number } | undefined,
  resolvedBy: GmbProfile["resolvedBy"],
): Promise<GmbProfile> {
  const body: Record<string, unknown> = { textQuery: text, pageSize: 1 };
  if (bias) {
    body.locationBias = { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 500 } };
  }
  const data = await call<{ places?: RawPlace[] }>(SEARCH_ENDPOINT, apiKey, FIELD_MASK_SEARCH, body);
  if (data === null) return NOT_FOUND("Couldn't reach Google to fetch the profile.");
  const p = data.places?.[0];
  if (!p) return NOT_FOUND('No matching business on Google. Paste the Google Maps URL, or add the city — e.g. "Cafe Mocha, Jaipur".');
  return mapPlace(p, resolvedBy);
}

async function fetchByPlaceId(placeId: string, apiKey: string): Promise<GmbProfile> {
  const data = await call<RawPlace>(`${DETAILS_ENDPOINT}${encodeURIComponent(placeId)}`, apiKey, FIELD_MASK_DETAILS, undefined, "GET");
  if (data === null) return NOT_FOUND("Couldn't fetch that place from Google (bad or expired URL?).");
  return mapPlace(data, "place-id");
}

const NEARBY_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

export type NearbyStub = {
  placeId: string;
  name: string;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null; // 0-4 (PRICE_LEVEL_MAP) — the tier signal for peer-matching
  lat: number | null;
  lng: number | null;
  primaryType: string | null;
  types: string[]; // full type set — powers a vertical-agnostic Jaccard peer signal
  businessStatus: string | null; // OPERATIONAL / CLOSED_* — drop closed rivals
};

// Finds SAME-CATEGORY businesses near a point — the candidate pool the
// battlecard narrows to true PEERS. One Places searchNearby call, lightweight
// field mask (rating/reviews/priceLevel are already the "Pro" SKU we pay for;
// priceLevel adds no tier). Returns null on any failure — never throws.
//
// rankBy DISTANCE (the battlecard default) returns a REPRESENTATIVE pool — all
// nearby same-type businesses regardless of size — so the peer matcher has small
// AND large rivals to choose from. POPULARITY pre-biases toward the giants,
// which is exactly the wrong pool when you're trying to find tier peers.
//
// CRITICAL: returns null when the API CALL FAILED, [] when Google genuinely
// returned no nearby same-type businesses. The battlecard MUST distinguish
// these — treating a failed call as "no rivals" fabricates a false "you have
// no local competition" finding in a report a paying client reads (the
// fail-silent -> false-claim class). Mirrors searchRankedPlaces below, which
// has always had this contract; this function was left behind until
// 2026-07-12.
export async function searchNearbyCompetitors(
  center: { lat: number; lng: number },
  primaryType: string | null,
  opts?: { radiusM?: number; max?: number; rankBy?: "POPULARITY" | "DISTANCE" },
): Promise<NearbyStub[] | null> {
  const apiKey = placesApiKey();
  // No key / no type is a CONFIG gap, not an empty market — still null.
  if (!apiKey || !primaryType) return null;
  const body: Record<string, unknown> = {
    includedPrimaryTypes: [primaryType],
    maxResultCount: Math.min(20, Math.max(5, opts?.max ?? 12)),
    rankPreference: opts?.rankBy ?? "POPULARITY",
    locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: opts?.radiusM ?? 3000 } },
  };
  const mask = "places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.location,places.primaryType,places.types,places.businessStatus";
  const data = await call<{ places?: RawPlace[] }>(NEARBY_ENDPOINT, apiKey, mask, body);
  if (!data) return null; // call failed — already Sentry-captured in call()
  if (!data.places) return []; // genuine empty result from Google
  return data.places
    .map((p: RawPlace): NearbyStub => ({
      placeId: p.id ?? "",
      name: p.displayName?.text ?? "(unknown)",
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      priceLevel: p.priceLevel ? PRICE_LEVEL_MAP[p.priceLevel] ?? null : null,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      primaryType: p.primaryType ?? null,
      types: Array.isArray(p.types) ? p.types : [],
      businessStatus: p.businessStatus ?? null,
    }))
    .filter((s: NearbyStub) => s.placeId);
}

// The shared transport for EVERY Places call in the GMB stack (profile,
// nearby, ranked, rank-grid). It returns null on failure — callers must treat
// null as "we could not read Google", never as "Google has nothing".
//
// Both failure paths here once returned null silently, so a revoked key, an
// exhausted quota or a 400 on an unsupported primary type was invisible — and
// downstream rendered as a factual claim about the client's market ("a
// genuinely thin competitive band"). Never do that: an OUR-SIDE failure must
// never be reported as a FACT ABOUT THE BUSINESS. Log it, then degrade.
async function call<T>(url: string, apiKey: string, fieldMask: string, body?: Record<string, unknown>, method: "GET" | "POST" = "POST"): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  const endpoint = url.split("?")[0];
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // Body may carry the Google error reason (bad field mask, unsupported
      // includedPrimaryTypes, quota). Never let it reach a response — Rule 14.
      const detail = await res.text().catch(() => "");
      logError("gmb/places", new Error(`Places API ${res.status} ${res.statusText}`), {
        endpoint,
        status: res.status,
        detail: detail.slice(0, 500),
      });
      return null;
    }
    return (await res.json().catch(() => null)) as T | null;
  } catch (e) {
    // Abort (20s timeout) or a network error. Both are system-class.
    logError("gmb/places", e, { endpoint });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Returns the ranked place IDs (top `limit`, max 20) for a free-text query
// biased to a point — the Local Rank Grid uses this to find a target's position
// by area AND to capture WHO ranks there (the competitor board). Field mask is
// id + displayName — displayName is the SAME (Essentials) Text Search SKU as
// id, so capturing rival names costs ZERO extra calls.
//
// CRITICAL: returns `null` when the API CALL FAILED (no key, quota, timeout,
// non-200, parse error) vs `[]` for a genuine empty result. The rank grid MUST
// distinguish these — treating a failed call as "not ranking here" fabricates a
// false "you're invisible" deficit (the fail-silent → false-claim class). Never
// throws.
export type RankedPlace = { id: string; name: string };

export async function searchRankedPlaces(
  center: { lat: number; lng: number },
  query: string,
  opts?: { radiusM?: number; limit?: number },
): Promise<RankedPlace[] | null> {
  const apiKey = placesApiKey();
  if (!apiKey) return null;
  const body: Record<string, unknown> = {
    textQuery: query,
    maxResultCount: Math.min(20, Math.max(5, opts?.limit ?? 20)),
    locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: opts?.radiusM ?? 1200 } },
  };
  const data = await call<{ places?: RawPlace[] }>(SEARCH_ENDPOINT, apiKey, "places.id,places.displayName", body);
  if (data === null) return null; // the call itself failed — NOT an empty result
  if (!data.places) return []; // genuine: no businesses matched at this point
  return data.places
    .map((p: RawPlace): RankedPlace => ({ id: p.id ?? "", name: p.displayName?.text ?? "(unknown)" }))
    .filter((r: RankedPlace) => r.id);
}

// City from Google's STRUCTURED addressComponents (locality), not a fragile
// comma-split of formattedAddress. Falls back through the admin hierarchy so we
// get a real city rather than the state. Returns null if nothing usable.
function cityFromComponents(p: RawPlace): string | null {
  const comps: RawPlace[] = p.addressComponents ?? [];
  if (!comps.length) return null;
  const byType = (t: string) => comps.find((c: RawPlace) => (c.types ?? []).includes(t));
  const pick =
    byType("locality") ??
    byType("postal_town") ??
    byType("administrative_area_level_3") ??
    byType("administrative_area_level_2"); // district — last resort, still not the state
  const name = pick?.longText ?? pick?.shortText ?? null;
  return name && String(name).trim() ? String(name).trim() : null;
}

function extractAttributes(p: RawPlace): GmbAttributes {
  const ao = p.accessibilityOptions ?? {};
  const accessibility: string[] = [];
  if (ao.wheelchairAccessibleEntrance) accessibility.push("Accessible entrance");
  if (ao.wheelchairAccessibleParking) accessibility.push("Accessible parking");
  if (ao.wheelchairAccessibleRestroom) accessibility.push("Accessible restroom");
  if (ao.wheelchairAccessibleSeating) accessibility.push("Accessible seating");

  const po = p.parkingOptions ?? {};
  const parking: string[] = [];
  if (po.freeParkingLot) parking.push("Free parking lot");
  if (po.paidParkingLot) parking.push("Paid parking lot");
  if (po.freeStreetParking) parking.push("Free street parking");
  if (po.valetParking) parking.push("Valet");
  if (po.freeGarageParking || po.paidGarageParking) parking.push("Garage parking");

  const pay = p.paymentOptions ?? {};
  const payments: string[] = [];
  if (pay.acceptsCreditCards) payments.push("Credit cards");
  if (pay.acceptsDebitCards) payments.push("Debit cards");
  if (pay.acceptsNfc) payments.push("NFC / mobile");
  if (pay.acceptsCashOnly) payments.push("Cash only");

  const serviceOptions: string[] = [];
  if (p.dineIn) serviceOptions.push("Dine-in");
  if (p.takeout) serviceOptions.push("Takeout");
  if (p.delivery) serviceOptions.push("Delivery");
  if (p.curbsidePickup) serviceOptions.push("Curbside pickup");
  if (p.reservable) serviceOptions.push("Reservations");

  const dining: string[] = [];
  if (p.servesBreakfast) dining.push("Breakfast");
  if (p.servesLunch) dining.push("Lunch");
  if (p.servesDinner) dining.push("Dinner");
  if (p.servesBrunch) dining.push("Brunch");
  if (p.servesVegetarianFood) dining.push("Vegetarian");
  if (p.servesCoffee) dining.push("Coffee");
  if (p.servesDessert) dining.push("Dessert");
  if (p.servesBeer) dining.push("Beer");
  if (p.servesWine) dining.push("Wine");
  if (p.servesCocktails) dining.push("Cocktails");

  const amenities: string[] = [];
  if (p.outdoorSeating) amenities.push("Outdoor seating");
  if (p.restroom) amenities.push("Restroom");
  if (p.goodForChildren) amenities.push("Good for kids");
  if (p.menuForChildren) amenities.push("Kids' menu");
  if (p.goodForGroups) amenities.push("Good for groups");
  if (p.goodForWatchingSports) amenities.push("Sports viewing");
  if (p.allowsDogs) amenities.push("Dog-friendly");
  if (p.liveMusic) amenities.push("Live music");

  // Only count the attribute groups that matter for this business type. For a
  // hotel / travel / clinic / shop, Dining + Service options are restaurant-
  // only noise, so they're excluded from both the score denominator and the
  // matrix (the UI hides them). totalPossible: food = 36, non-food = 21.
  const isFood = isFoodBusiness(p.primaryType ?? null, p.types ?? []);
  const relevant = isFood
    ? [accessibility, parking, payments, serviceOptions, dining, amenities]
    : [accessibility, parking, payments, amenities];
  return {
    accessibility, parking, payments, serviceOptions, dining, amenities,
    isFood,
    totalSet: relevant.reduce((n, g) => n + g.length, 0),
    totalPossible: isFood ? 36 : 21,
  };
}

function formatPriceRange(pr: RawPlace): string | null {
  if (!pr?.startPrice?.units) return null;
  const cur = pr.startPrice.currencyCode as string | undefined;
  const sym = cur === "INR" ? "₹" : cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : `${cur ?? ""} `;
  const s = pr.startPrice.units;
  const e = pr.endPrice?.units;
  return e ? `${sym}${s}–${e}` : `${sym}${s}+`;
}

function mapPlace(p: RawPlace, resolvedBy: GmbProfile["resolvedBy"]): GmbProfile {
  const reg = p.regularOpeningHours;
  const cur = p.currentOpeningHours;
  const hours = reg ?? cur;
  const weekdayHours: string[] = hours?.weekdayDescriptions ?? [];
  // daysOpen from STRUCTURED periods (locale-proof); fall back to the string
  // heuristic only when periods are absent.
  const daysOpen = daysOpenFromPeriods(reg?.periods ?? cur?.periods) ?? countDaysOpen(weekdayHours);
  // openNow from CURRENT hours first (accounts for holiday/special hours), then
  // regular. hasSpecialHours is now TRUTHFUL — set from specialDays, not hardcoded.
  const openNow = cur?.openNow ?? reg?.openNow ?? null;
  const hasSpecialHours = Array.isArray(cur?.specialDays) && cur.specialDays.length > 0;
  const reviews: GmbReview[] = (p.reviews ?? []).slice(0, 5).map((r: RawPlace) => ({
    rating: r.rating ?? null,
    publishTime: r.publishTime ?? null,
    relativeTime: r.relativePublishTimeDescription ?? null,
    text: r.text?.text ?? r.originalText?.text ?? null,
    authorName: r.authorAttribution?.displayName ?? null,
  }));
  const name = p.displayName?.text ?? "(unknown)";
  // The Places API (New) returns AT MOST 10 photo references and has no
  // total-count field — so 10 means "10 or more". Track the cap explicitly
  // so scoring/issues never claim a deficit for a well-stocked gallery.
  const photos = p.photos ?? [];
  const attributes = extractAttributes(p);
  const website = p.websiteUri ?? null;
  const rating = p.rating ?? null;
  const reviewCount = p.userRatingCount ?? null;
  const category = p.primaryTypeDisplayName?.text ?? null;
  const types: string[] = p.types ?? [];
  const GENERIC = new Set(["point_of_interest", "establishment", "food", "store", "place_of_worship"]);
  const secondaryTypeCount = types.filter((t) => t !== p.primaryType && !GENERIC.has(t)).length;

  return {
    found: true,
    placeId: p.id ?? null,
    resolvedBy,
    name,
    category,
    primaryType: p.primaryType ?? null,
    secondaryTypeCount,
    types,
    address: p.formattedAddress ?? null,
    city: cityFromComponents(p) ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    website,
    websiteQuality: websiteQuality(website),
    googleMapsUri: p.googleMapsUri ?? null,
    writeReviewUri: p.googleMapsLinks?.writeAReviewUri ?? null,
    rating,
    reviewCount,
    priceLevel: p.priceLevel ? PRICE_LEVEL_MAP[p.priceLevel] ?? null : null,
    priceRange: formatPriceRange(p.priceRange),
    photoCount: photos.length || null,
    photosCapped: photos.length >= PHOTO_CAP,
    businessStatus: p.businessStatus ?? null,
    hasHours: weekdayHours.length > 0,
    weekdayHours,
    daysOpen,
    hasSpecialHours,
    openNow,
    editorialSummary: p.editorialSummary?.text ?? null,
    reviewSummary: p.reviewSummary?.text?.text ?? null,
    attributes,
    hasAccessibility: attributes.accessibility.length > 0,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    reviews,
    reviewIntel: computeReviewIntel(reviews, rating, reviewCount, category),
  };
}
