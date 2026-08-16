// In-memory per-key rate limiter. Per-instance (so a Vercel serverless
// horizontal-scale event resets the count for new workers), which means
// a distributed attacker hitting many cold starts can amplify their
// effective rate. That's acceptable for the spam/brute-force shapes
// these limiters guard against here — combined with stronger dedupe at
// the DB layer (e.g. webform same-email-within-60s) and Sentry-alerting
// crons, a real flood would still page someone.
//
// For higher-stakes endpoints (auth bypass on a stolen session, payment
// retries) graduate to Upstash/Redis once we have one wired up.

type Bucket = { count: number; resetAt: number };

const BUCKETS = new Map<string, Bucket>();

// Periodic cleanup so the Map doesn't grow unbounded under sustained
// attack. We only sweep when the map gets noisy — most lookups skip it.
const CLEAN_THRESHOLD = 5_000;

function maybeClean(now: number): void {
  if (BUCKETS.size < CLEAN_THRESHOLD) return;
  for (const [k, v] of BUCKETS) {
    if (v.resetAt < now) BUCKETS.delete(k);
  }
}

/**
 * Returns true if the request is allowed (under limit), false if rate-limited.
 *
 *   limit:   max events per window
 *   windowMs: window size in milliseconds
 *   key:     anything stable per-actor (IP, user id, IP+route)
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  maybeClean(now);
  const entry = BUCKETS.get(key);
  if (!entry || entry.resetAt < now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/**
 * Best-effort client-IP extraction. Reads `x-forwarded-for` (Vercel +
 * most CDNs) and falls back to a literal "unknown" so two
 * hard-to-attribute callers share a bucket — that's fine for rate
 * limiting since it errs on the side of stricter limits.
 */
export function clientIp(req: Request): string {
  // Prefer Vercel's platform-set header — stamped by the edge BEFORE
  // userland sees the request and not user-spoofable. Without this,
  // an attacker setting `X-Forwarded-For: 1.2.3.4` rotates the rate-
  // limit bucket key freely on every request, defeating the login
  // limiter, audit-contact limiter, unsubscribe limiter, etc.
  //
  // Gated on `process.env.VERCEL` so a non-Vercel deploy (local dev,
  // self-hosted) can't be tricked by an attacker setting the
  // `x-vercel-forwarded-for` header themselves. On Vercel the
  // platform strips this header on inbound requests from outside the
  // edge; off-Vercel that guarantee doesn't exist.
  const onVercel = !!process.env.VERCEL;
  const vercel = onVercel ? req.headers.get("x-vercel-forwarded-for") : null;
  if (vercel) return vercel.split(",")[0]!.trim();
  // Fallback for local dev / non-Vercel deploys. Take the RIGHTMOST
  // XFF entry (closest to OUR edge), not the leftmost (client-claimed).
  // A trusted reverse proxy appends; the rightmost segment is the one
  // we control. Leftmost is whatever the client put there.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/** Quick guard against oversized JSON bodies. Vercel's ingress is 4.5MB
 *  by default — request bodies on small POST endpoints (login, change-
 *  request submission, account create) realistically top out under 8KB,
 *  so anything bigger is either accidental or a memory-pressure probe.
 *  Returns true if the body is safe to parse, false if we should 413.
 *
 *  Fail-closed when Content-Length is absent or malformed. Prior shape
 *  returned `true` on a missing CL header with the rationale "let
 *  req.json() decide" — but `req.json()` buffers the entire stream
 *  before parsing on Node.js route handlers, so a chunked-encoded POST
 *  with no Content-Length bypassed the cap entirely. Up to Vercel's
 *  4.5MB ceiling per request, multiplied across cold-start IP-rotation,
 *  was the real attack surface. Fail-closed (return false → 413) on
 *  missing CL forces well-behaved clients to declare their size and
 *  refuses chunked-encoded probes outright. Same fail-closed for
 *  negative values (parseInt("-1") returns -1, which is always
 *  malformed). */
export function bodyUnder(req: Request, maxBytes: number): boolean {
  const cl = req.headers.get("content-length");
  if (!cl) return false;
  const n = parseInt(cl, 10);
  if (!Number.isFinite(n) || n < 0) return false;
  return n <= maxBytes;
}
