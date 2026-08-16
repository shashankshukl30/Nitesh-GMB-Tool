// Single source of truth for everything client-specific.
//
// Rebranding, changing the contact link, or moving to a different domain are
// all edits to THIS FILE (or the matching environment variables) — no other
// file hardcodes a name, a URL, or a phone number.

/** Canonical origin. Set NEXT_PUBLIC_SITE_URL in the host's environment. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://connect2click.com").replace(/\/$/, "");

export const BRAND = {
  name: "Connect2Click",
  /** Shown next to the wordmark. Keep it under ~28 characters. */
  tagline: "Local visibility intelligence",
  title: "Free Google Business Profile Audit + Competitor Check — Connect2Click",
  description:
    "Score any Google Business Profile in seconds — reviews, photos, categories, hours and attributes — " +
    "then see the local rivals Google actually ranks you against. Free, no signup.",
} as const;

/** Reachable ways to get a human. Rendered on /contact and in the footer. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "ads.lazyclicks@gmail.com";

/** E.164, for the tel: href — no spaces, no punctuation. */
export const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || "+918808804344";

/** How the number is shown to a reader. Grouped for scannability. */
export const CONTACT_PHONE_DISPLAY = "+91 88088 04344";

/**
 * Where the report's closing call-to-action points.
 *
 * Defaults to the on-site contact page. Override with NEXT_PUBLIC_CONTACT_URL
 * to send people straight to WhatsApp (https://wa.me/<number>), a mailto:, or a
 * booking page instead. Set it to an empty string and the CTA button is hidden
 * entirely rather than rendering a dead link.
 */
export const CONTACT_URL =
  process.env.NEXT_PUBLIC_CONTACT_URL === undefined ? "/contact" : process.env.NEXT_PUBLIC_CONTACT_URL.trim();

/** The one-line pitch under the closing CTA. */
export const CONTACT_PITCH =
  process.env.NEXT_PUBLIC_CONTACT_PITCH?.trim() ||
  "We run the review, photo, category and attribute work that closes these gaps — and keeps your listing ahead of the businesses ranking beside you.";

/** Label on the CTA button. */
export const CONTACT_CTA = process.env.NEXT_PUBLIC_CONTACT_CTA?.trim() || "Talk to us about fixing this →";
