// Resolve user input to an EXACT place reference.
//
// A plain business name can match the wrong listing, so the GMB tool wants a
// Google Maps / Business Profile URL. This turns any of these into a precise
// lookup:
//   - a bare place_id (ChIJ… / GhIJ…)            → exact Place Details lookup
//   - a full maps URL .../place/<Name>/@lat,lng  → name + tight location bias
//   - a place_id query (?q=place_id:ChIJ…)       → exact
//   - a Google short link (maps.app.goo.gl, …)   → expanded, then parsed
//   - a plain name (fallback)                    → text search (may be fuzzy)

export type PlaceRef =
  | { kind: "placeId"; placeId: string }
  | { kind: "textWithBias"; text: string; lat: number; lng: number }
  | { kind: "text"; text: string };

// Only these hosts are ever FETCHED for redirect expansion — keeps this from
// becoming an SSRF vector (we never follow a redirect to an arbitrary host).
const SHORT_HOSTS = ["maps.app.goo.gl", "goo.gl", "g.page", "g.co"];
const PLACE_ID_RE = /((?:ChIJ|GhIJ)[A-Za-z0-9_-]{8,})/;

export async function resolvePlaceRef(input: string): Promise<PlaceRef> {
  const raw = input.trim();

  // Bare place_id pasted directly.
  const bare = raw.match(/^((?:ChIJ|GhIJ)[A-Za-z0-9_-]{8,})$/);
  if (bare) return { kind: "placeId", placeId: bare[1]! };

  const looksUrl =
    /^https?:\/\//i.test(raw) ||
    /\b(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|g\.page|goo\.gl\/maps|maps\.google\.[a-z.]+)\b/i.test(raw);
  if (!looksUrl) return { kind: "text", text: raw };

  let url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  url = await expandShortLink(url);

  // place_id token anywhere (query param or a bare ChIJ in the URL).
  const idm = url.match(/place_id[:=]((?:ChIJ|GhIJ)[A-Za-z0-9_-]+)/) ?? url.match(PLACE_ID_RE);
  if (idm) return { kind: "placeId", placeId: idm[1]! };

  // Name + precise coords from /maps/place/<Name>/@lat,lng — exact in practice.
  const name = extractPlaceName(url);
  const coords = extractCoords(url);
  if (name && coords) return { kind: "textWithBias", text: name, lat: coords.lat, lng: coords.lng };
  if (name) return { kind: "text", text: name };

  // ?q= or ?query= fallback.
  const q = extractQuery(url);
  if (q) return { kind: "text", text: q.replace(/^place_id:/i, "").trim() };

  // Couldn't parse a business out of the URL — search the raw string.
  return { kind: "text", text: raw };
}

/** Follow redirects ONLY through Google short-link hosts; return the first
 *  non-short destination URL without fetching it (SSRF-safe). */
async function expandShortLink(url: string): Promise<string> {
  let current = url;
  try {
    for (let i = 0; i < 5; i++) {
      const host = new URL(current).hostname.toLowerCase().replace(/^www\./, "");
      const isShort = SHORT_HOSTS.some((h) => host === h || host.endsWith("." + h));
      if (!isShort) return current; // reached the real destination — don't fetch it
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(current, { method: "GET", redirect: "manual", signal: ctrl.signal }).catch(() => null);
      clearTimeout(t);
      if (!res) return current;
      const loc = res.headers.get("location");
      if (loc && [301, 302, 303, 307, 308].includes(res.status)) {
        current = new URL(loc, current).toString();
        continue;
      }
      return current;
    }
  } catch {
    /* fall through */
  }
  return current;
}

function extractPlaceName(url: string): string | null {
  const m = url.match(/\/maps\/place\/([^/@?]+)/i);
  if (!m) return null;
  try {
    const decoded = decodeURIComponent(m[1]!.replace(/\+/g, " ")).trim();
    return decoded && decoded !== "/" ? decoded : null;
  } catch {
    return m[1]!.replace(/\+/g, " ").trim() || null;
  }
}

function extractCoords(url: string): { lat: number; lng: number } | null {
  // Prefer the !3d/!4d data coords (the place pin) over @ (the viewport center).
  const data = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (data) return { lat: Number(data[1]), lng: Number(data[2]) };
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  return null;
}

function extractQuery(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("q") ?? u.searchParams.get("query") ?? null;
  } catch {
    return null;
  }
}
