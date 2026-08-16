// Brand-tier detection for competitor peer-matching (2026-06-14).
//
// The Places API exposes NO per-night price for hotels (priceLevel/priceRange
// come back null — the prices you see on Google search are Google Hotels data,
// a separate source). So the sharpest "are you in the same market?" signal we
// CAN get is the brand: a guest choosing a ~₹2k independent isn't cross-
// shopping a branded ~₹6k DoubleTree/Taj/Radisson, and vice versa. This is how
// MakeMyTrip / Booking implicitly separate compsets — by class, not review
// count. An independent hotel and a premium-chain hotel are different tiers
// even with similar review volume.
//
// Budget chains (OYO, FabHotel, Treebo, Ginger, Ibis, SPOT, Zo, Bloomrooms)
// are DELIBERATELY EXCLUDED — they genuinely ARE peers of independent
// budget/mid hotels, so they must NOT be flagged premium.

export type BrandTier = "premium" | "standard";

// Premium / upscale hotel brands (Indian + international). Lowercase. Single
// tokens are matched on word boundaries; multi-word/hyphenated names are matched
// as substrings (they're distinctive enough not to false-positive).
export const PREMIUM_BRANDS = [
  // Indian luxury / upscale
  "taj", "vivanta", "seleqtions", "oberoi", "trident", "itc", "welcomhotel",
  "leela", "lalit",
  // Marriott family
  "marriott", "jw marriott", "le meridien", "sheraton", "westin", "renaissance",
  "ritz-carlton", "ritz carlton", "st. regis", "st regis", "courtyard",
  // Hilton family
  "hilton", "doubletree", "conrad", "waldorf",
  // Hyatt
  "hyatt", "andaz",
  // Radisson / Wyndham
  "radisson", "park plaza", "ramada", "wyndham",
  // IHG
  "intercontinental", "crowne plaza", "holiday inn",
  // Accor
  "novotel", "sofitel", "pullman", "fairmont", "movenpick",
  // Other luxury
  "four seasons", "shangri-la", "shangri la", "mandarin oriental",
];

const MULTIWORD = PREMIUM_BRANDS.filter((b) => b.includes(" ") || b.includes("-"));
const SINGLE = new Set(PREMIUM_BRANDS.filter((b) => !b.includes(" ") && !b.includes("-")));

/** "premium" if the name carries a recognized upscale/luxury hotel brand, else
 *  "standard" (independent / budget / mid). Token-boundary matched for single
 *  words so "itc" never matches "kitchen", "taj" never matches "tajmahal cafe". */
export function brandTier(name: string | null | undefined): BrandTier {
  if (!name) return "standard";
  const n = name.toLowerCase();
  for (const b of MULTIWORD) if (n.includes(b)) return "premium";
  for (const token of n.split(/[^a-z0-9]+/)) if (token && SINGLE.has(token)) return "premium";
  return "standard";
}
