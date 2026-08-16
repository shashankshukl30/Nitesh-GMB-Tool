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

/**
 * Where the report's closing call-to-action points.
 *
 * Set NEXT_PUBLIC_CONTACT_URL to a WhatsApp link (https://wa.me/<number>), a
 * mailto:, or a booking page. Leave it unset and the CTA button is hidden
 * entirely rather than rendering a dead link.
 */
export const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL?.trim() || "";

/** The one-line pitch under the closing CTA. */
export const CONTACT_PITCH =
  process.env.NEXT_PUBLIC_CONTACT_PITCH?.trim() ||
  "We run the review, photo, category and attribute work that closes these gaps — and keeps your listing ahead of the businesses ranking beside you.";

/** Label on the CTA button. */
export const CONTACT_CTA = process.env.NEXT_PUBLIC_CONTACT_CTA?.trim() || "Talk to us about fixing this →";
