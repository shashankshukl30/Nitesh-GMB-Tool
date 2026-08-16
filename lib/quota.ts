// Places API cost control — DATABASE-FREE.
//
// The original tool metered Google Places usage in Postgres. This build has no
// database by design (nothing about a visitor is ever stored), so the counter
// lives in process memory: a single day-stamped tally per serverless instance.
//
// ── Read this before trusting it ────────────────────────────────────────────
// In-memory means PER INSTANCE and RESET ON COLD START. Under real traffic the
// host may run several instances, so this counter UNDER-counts and must be
// treated as a courtesy brake, not a spend ceiling.
//
// The real, enforceable cost control is on Google's side and is free:
//   1. GCP Console → APIs & Services → Places API → Quotas
//      set "Requests per day" to a hard number. Google refuses calls past it.
//   2. Restrict the API key to the Places API only, and to this site's HTTP
//      referrers, so a leaked key can't be spent elsewhere.
//   3. Billing → Budgets & alerts → an email budget at a low threshold.
// Steps 1–3 are in RUNBOOK.md. That is what makes the bill un-runaway-able;
// this module only stops one hot instance from burning a day's quota alone.

/** Daily call ceiling. Override with PLACES_DAILY_CAP in the environment. */
const DAILY_CAP = (() => {
  const raw = Number.parseInt(process.env.PLACES_DAILY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 2000;
})();

/** Fraction of the cap at which optional extras stop running. */
const SOFT_CAP_PCT = 0.8;

let day = "";
let calls = 0;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Roll the tally over at UTC midnight. */
function sync(): void {
  const d = today();
  if (d !== day) {
    day = d;
    calls = 0;
  }
}

/** Calls counted against today's tally on this instance. */
export function getTodayApiCalls(): number {
  sync();
  return calls;
}

/** True once today's tally passes the soft cap — callers skip optional extras. */
export function isOverSoftCap(currentCalls: number): boolean {
  return currentCalls >= DAILY_CAP * SOFT_CAP_PCT;
}

/** Add to today's tally. Called after a batch of Places requests. */
export function recordApiCalls(count: number): void {
  if (count <= 0) return;
  sync();
  calls += count;
}

export const QUOTA_DAILY_LIMIT = DAILY_CAP;
export const QUOTA_SOFT_CAP = Math.round(DAILY_CAP * SOFT_CAP_PCT);
