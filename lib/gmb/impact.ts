// Money-left-on-the-table — loss-framed impact estimates (2026-06-21).
//
// The biggest conversion gap vs the site audit was that every GMB gap was framed
// in ranking terms ("only 12 reviews") with no translation to lost business. Loss
// aversion converts ~1.5–2.5x harder than gain framing, so this turns each gap
// into a clearly-labelled estimate of lost customer actions/month.
//
// HONESTY (rule #1): we CANNOT read a profile's private Google Insights. Every
// number here is an INDUSTRY-BENCHMARK ESTIMATE applied to the gaps the Places
// API can see, and must always be labelled as such — never presented as a
// measured figure. Published GBP benchmarks used (newmedia / webfx / searchlab):
//   • a typical local SMB profile sees ~59 customer actions/month
//     (~20 website clicks, ~16 direction requests, ~10 calls, ~13 other)
//   • 50+ reviews ≈ +30% visibility · 4.5★+ ≈ +28% clicks
//   • profiles with photos ≈ +24% action rate

import type { GmbProfile } from "./types";
import type { GmbFinding } from "./findings";

// Industry-average monthly customer actions for a typical local SMB profile.
const BENCHMARK_ACTIONS = 59;
const CALL_SHARE = 10 / 59; // ~17% of actions are phone calls

// How much each gap SUPPRESSES the action rate, from the benchmarks above. These
// combine multiplicatively (a profile with several gaps doesn't lose >100%).
const SUPPRESSION: Record<string, number> = {
  "status-closed-perm": 0.95, "status-closed-temp": 0.6,
  "reviews-zero": 0.4, "reviews-thin": 0.25, "reviews-building": 0.12,
  "rating-low": 0.2, "sentiment-neg": 0.12,
  "web-none": 0.15, "web-social": 0.08, "web-free": 0.04,
  "hours-none": 0.1, "hours-partial": 0.05,
  "photos-none": 0.24, "photos-thin": 0.1,
  "attrs-none": 0.06, "attrs-thin": 0.03,
  "cat-none": 0.3, "cat-no-secondary": 0.04, "cat-generic": 0.18,
  "desc-none": 0.03,
};

export type MoneyLeft = {
  lostActionsPerMonth: number;
  lostCallsPerMonth: number;
  headline: string;
  basis: string; // the mandatory "this is an estimate" label
};

/** A per-finding loss line, e.g. "≈ 4 fewer customer actions/month". Always an
 *  estimate; returns null when the finding has no benchmarked impact. */
export function findingImpact(finding: GmbFinding): string | null {
  const s = SUPPRESSION[finding.id];
  if (!s) return null;
  const lost = Math.round(BENCHMARK_ACTIONS * s);
  if (lost < 1) return null;
  return `≈ ${lost} fewer customer actions/month (industry-benchmark estimate)`;
}

/** Attach an `impact` string to each finding in place-safe (returns new array). */
export function withImpact(findings: GmbFinding[]): GmbFinding[] {
  return findings.map((f) => ({ ...f, impact: findingImpact(f) ?? undefined }));
}

/** The top-of-report "money left on the table" headline. Combines the gaps'
 *  suppression multiplicatively against the benchmark baseline. */
export function moneyLeftOnTable(p: GmbProfile, findings: GmbFinding[]): MoneyLeft {
  // Retained fraction = Π(1 - suppression) over the gaps we found.
  let retained = 1;
  for (const f of findings) {
    const s = SUPPRESSION[f.id];
    if (s) retained *= 1 - s;
  }
  const lostFraction = 1 - retained;
  const lostActions = Math.round(BENCHMARK_ACTIONS * lostFraction);
  const lostCalls = Math.max(0, Math.round(lostActions * CALL_SHARE));

  const headline =
    lostActions <= 0
      ? `This profile is broadly dialed in — there's no large pool of obviously lost actions to recover.`
      : `Roughly ${lostActions} customer action${lostActions === 1 ? "" : "s"} a month — about ${lostCalls} call${lostCalls === 1 ? "" : "s"} — are likely going to better-optimized competitors instead of you.`;

  return {
    lostActionsPerMonth: lostActions,
    lostCallsPerMonth: lostCalls,
    headline,
    basis: `Estimated from published Google Business Profile industry benchmarks (a typical local profile sees ~${BENCHMARK_ACTIONS} actions/month) applied to the gaps in this listing — not your private Google Insights, which only you can see.`,
  };
}
