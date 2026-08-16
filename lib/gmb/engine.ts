// GMB analysis orchestrator. Single public export: runGmbAudit(input).
//
//   input (Maps URL | place-id | name) → exact public profile → scores →
//   severity-ranked findings + money-left-on-table + per-dimension verdicts +
//   vertical + coverage envelope → GmbResult. Never throws.

import { fetchGmbProfile } from "./places";
import { scoreProfile, completenessItems } from "./scoring";
import { identifyGmbIssues, buildRecommendations, identifyGmbAngles } from "./issues";
import { buildFindings } from "./findings";
import { withImpact, moneyLeftOnTable, type MoneyLeft } from "./impact";
import { dimensionVerdicts, overallVerdict } from "./verdicts";
import { detectGmbVertical } from "./analysis";
import type { GmbResult } from "./types";

const EMPTY_MONEY: MoneyLeft = { lostActionsPerMonth: 0, lostCallsPerMonth: 0, headline: "", basis: "" };

export async function runGmbAudit(input: string): Promise<GmbResult> {
  const startedAt = Date.now();
  const q = input.trim();
  const profile = await fetchGmbProfile(q);

  if (!profile.found) {
    return {
      query: q,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      found: false,
      reason: profile.reason,
      profile,
      scores: { overall: 0, reviews: 0, completeness: 0, attributes: 0, photos: 0, categories: 0, hours: 0 },
      grade: "F",
      completeness: [],
      topIssues: [],
      recommendations: [],
      pitchAngles: [],
      findings: [],
      moneyLeft: EMPTY_MONEY,
      verdicts: [],
      overallVerdict: "",
      vertical: { vertical: "generic", label: "local business", confidence: "low" },
      coverage: { reviewSummary: "absent", editorialSummary: "absent", hours: "not-set", price: "absent-for-vertical" },
    };
  }

  const { scores, grade } = scoreProfile(profile);
  const vertical = detectGmbVertical(profile.primaryType, profile.category, profile.types);
  const findings = withImpact(buildFindings(profile));
  const moneyLeft = moneyLeftOnTable(profile, findings);

  return {
    query: q,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    found: true,
    profile,
    scores,
    grade,
    completeness: completenessItems(profile),
    topIssues: identifyGmbIssues(profile),
    recommendations: buildRecommendations(profile),
    pitchAngles: identifyGmbAngles(profile, scores),
    findings,
    moneyLeft,
    verdicts: dimensionVerdicts(profile, scores),
    overallVerdict: overallVerdict(scores, grade, vertical.label),
    vertical,
    coverage: {
      reviewSummary: profile.reviewSummary ? "present" : "absent",
      editorialSummary: profile.editorialSummary ? "present" : "absent",
      hours: profile.hasHours ? "set" : "not-set",
      price: profile.priceLevel != null || profile.priceRange ? "populated" : "absent-for-vertical",
    },
  };
}
