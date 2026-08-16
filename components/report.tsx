// The profile health report.
//
// Ported intact from the engine's original renderer — the wording, the ordering
// and the hedges are load-bearing. Two rules survive from that build and must
// not be softened:
//
//   1. Never render OUR failure as a FACT about the business. An empty
//      attribute group is "none reported", not a red gap, because Google
//      omits most attribute booleans for many verticals.
//   2. Never imply data Google doesn't give us. The reviews block is labelled
//      a relevance-ranked SAMPLE, not a recency feed, because the Places API
//      returns ~5 "most helpful" reviews and there is no path to newest.
//
// Breaking either turns a sales artifact into a false claim about someone's
// business, which is the worst bug this product can ship.

"use client";

import { motion } from "motion/react";
import type { GmbResult } from "@/lib/gmb/types";
import type { GmbFinding } from "@/lib/gmb/findings";
import type { DimensionVerdict } from "@/lib/gmb/verdicts";
import { scoreToGrade, type Grade } from "@/lib/grade";
import { CONTACT_URL, CONTACT_PITCH, CONTACT_CTA } from "@/lib/site";

export function Report({ result }: { result: GmbResult }) {
  if (!result.found) {
    return (
      <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card mt-6 border-[var(--color-red-soft)] px-6 py-6">
        <div className="text-[15px] font-semibold" style={{ color: "var(--color-red)" }}>Couldn&apos;t find &ldquo;{result.query}&rdquo;</div>
        <div className="mt-1.5 text-[12.5px] text-[var(--color-ink-3)]">{result.reason ?? "No matching business. Paste the Google Maps URL, or add the city."}</div>
      </motion.section>
    );
  }
  const p = result.profile;
  const s = result.scores;
  const ri = p.reviewIntel;
  const matchLabel = p.resolvedBy === "place-id" ? "Exact match (place ID)" : p.resolvedBy === "url-coords" ? "Exact match (Maps URL)" : "Name match";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="mt-6 space-y-5">
      {/* Hero */}
      <section className="card p-6">
        <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-[auto,1fr,auto]">
          <GradeChip grade={result.grade} large />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="eyebrow">Profile health score for</span>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: p.resolvedBy === "name" ? "var(--color-yellow-soft)" : "var(--color-green-soft)", color: p.resolvedBy === "name" ? "#b87b00" : "var(--color-green)" }}>{matchLabel}</span>
            </div>
            <div className="mt-0.5 truncate text-[16px] font-bold text-[var(--color-ink)]">{p.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-muted)]">
              <span>{p.category ?? "Uncategorized"}{p.address ? ` · ${p.address}` : ""}</span>
              {result.vertical.vertical !== "generic" && (
                <span className="rounded-full bg-[var(--color-bg-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-ink-3)]" title={`Detected ${result.vertical.confidence} confidence`}>Detected: {result.vertical.label}</span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[28px] font-bold tabular-nums text-[var(--color-ink)]">{s.overall}</span>
              <span className="text-[14px] font-medium text-[var(--color-muted-2)]">/ 100</span>
              {p.businessStatus && p.businessStatus !== "OPERATIONAL" && (
                <span className="ml-2 rounded-full bg-[var(--color-red-soft)] px-2 py-0.5 text-[10px] font-semibold" style={{ color: "var(--color-red)" }}>{p.businessStatus.replace("_", " ").toLowerCase()}</span>
              )}
            </div>
          </div>
          <div className="text-[10px] text-[var(--color-muted-2)] md:text-right">
            {p.googleMapsUri && <div><a href={p.googleMapsUri} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: "var(--color-accent)" }}>Open on Maps →</a></div>}
            {p.writeReviewUri && <div className="mt-0.5"><a href={p.writeReviewUri} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>Write-review link</a></div>}
            <div className="mt-1">{(result.durationMs / 1000).toFixed(1)}s</div>
          </div>
        </div>
      </section>

      {/* Verdict + money left on the table — the conversion spine */}
      {(result.overallVerdict || result.moneyLeft.lostActionsPerMonth > 0) && (
        <section className="card p-5">
          {result.overallVerdict && <p className="text-[14px] font-medium leading-relaxed text-[var(--color-ink)]">{result.overallVerdict}</p>}
          {result.moneyLeft.lostActionsPerMonth > 0 && (
            <div className="mt-3 rounded-xl border border-[var(--color-red-soft)] p-4" style={{ background: "var(--color-red-soft)" }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-red)" }}>Money left on the table</div>
              <p className="mt-1 text-[14px] font-semibold leading-snug text-[var(--color-ink)]">{result.moneyLeft.headline}</p>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--color-muted-2)]">{result.moneyLeft.basis}</p>
            </div>
          )}
        </section>
      )}

      {/* 6 dimension cards — each with its finish-line target */}
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {result.verdicts.map((v) => <ScoreCard key={v.key} v={v} />)}
      </section>

      {/* Review intelligence + AI summary */}
      {(p.reviewCount ?? 0) > 0 && (
        <section className="card p-5">
          <div className="eyebrow mb-3">Review intelligence</div>
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <Chip label={`Sentiment: ${ri.sentiment}`} tone={ri.sentiment === "positive" ? "green" : ri.sentiment === "negative" ? "red" : "neutral"} />
            {ri.positiveShare != null && <Chip label={`${ri.positiveShare}% positive (sample)`} tone="neutral" />}
            {ri.benchmark && <Chip label={ri.benchmark} tone={ri.benchmark.includes("below") ? "red" : ri.benchmark.includes("above") ? "green" : "neutral"} />}
          </div>
          {(ri.praisedThemes.length > 0 || ri.flaggedThemes.length > 0) && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ri.praisedThemes.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--color-green)" }}>Praised for</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">{ri.praisedThemes.map((t) => <span key={t} className="rounded-full bg-[var(--color-green-soft)] px-2 py-0.5 text-[11px]" style={{ color: "var(--color-green)" }}>{t}</span>)}</div>
                </div>
              )}
              {ri.flaggedThemes.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--color-red)" }}>Flagged for</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">{ri.flaggedThemes.map((t) => <span key={t} className="rounded-full bg-[var(--color-red-soft)] px-2 py-0.5 text-[11px]" style={{ color: "var(--color-red)" }}>{t}</span>)}</div>
                </div>
              )}
            </div>
          )}
          {ri.praisedThemes.length === 0 && ri.flaggedThemes.length === 0 && ri.themes.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-muted-2)]">Themes in reviews</div>
              <div className="mt-1 flex flex-wrap gap-1.5">{ri.themes.map((t) => <span key={t} className="rounded-full bg-[var(--color-bg-2)] px-2 py-0.5 text-[11px] text-[var(--color-ink-3)]">{t}</span>)}</div>
            </div>
          )}
          {p.reviewSummary && (
            <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-2)] p-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-muted-2)]">🤖 Google AI review summary</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">{p.reviewSummary}</p>
            </div>
          )}
        </section>
      )}

      {/* Attributes matrix */}
      <section className="card p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="eyebrow">Attributes &amp; amenities</div>
          <div className="text-[10px] text-[var(--color-muted-2)]">{p.attributes.totalSet} of ~{p.attributes.totalPossible} set</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <AttrGroup label="Accessibility" items={p.attributes.accessibility} />
          <AttrGroup label="Parking" items={p.attributes.parking} />
          <AttrGroup label="Payments" items={p.attributes.payments} />
          {/* Dining + Service options are food-only — hidden for hotels/travel/etc. */}
          {p.attributes.isFood && <AttrGroup label="Service options" items={p.attributes.serviceOptions} />}
          {p.attributes.isFood && <AttrGroup label="Dining" items={p.attributes.dining} />}
          <AttrGroup label="Amenities" items={p.attributes.amenities} />
        </div>
      </section>

      {/* Action plan — severity-ranked, quick-wins separated from strategic */}
      <ActionPlan findings={result.findings} />

      {/* The engine also produces `pitchAngles` — operator-facing notes on how
          to SELL the fix. They are deliberately never rendered here and are
          stripped in the API layer too, because this page is shown to the
          business being audited. Seeing how you're about to be pitched
          destroys the report's credibility. */}

      {/* Details + completeness */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DetailCard label="Profile details" rows={[
          ["Category", p.category ?? "— none"],
          ["Secondary categories", `${p.secondaryTypeCount}`],
          ["Rating", p.rating != null ? `${p.rating.toFixed(1)}★ (${p.reviewCount ?? 0})` : "— none"],
          ["Website", p.websiteQuality === "real" ? (p.website ?? "real") : p.websiteQuality === "none" ? "— none" : `— ${p.websiteQuality}`],
          ["Phone", p.phone ?? "— none"],
          ["Photos", p.photoCount == null ? "— none" : p.photosCapped ? "10+ (Google caps the count at 10)" : `${p.photoCount}`],
          ["Hours", p.hasHours ? `${p.daysOpen}/7 days${p.openNow == null ? "" : p.openNow ? " · open now" : " · closed now"}` : "— not set"],
          ["Price", p.priceRange ?? (p.priceLevel != null ? "$".repeat(Math.max(1, p.priceLevel)) : p.attributes.isFood ? "— not set" : "not exposed for this business type")],
          ["Status", (p.businessStatus ?? "unknown").replace("_", " ").toLowerCase()],
        ]} />
        <CompletenessCard items={result.completeness} />
      </section>

      {/* Review sample — Google's API returns only ~5 RELEVANCE-ranked ("most
          helpful") reviews, never the newest, and there's no API path to newest
          (legacy reviews_sort is disabled). So we present these as a featured
          sample, NOT a recency timeline, and anchor the reader to the real
          total. Order is left as Google returns it (relevance) — sorting by
          date would falsely imply a chronological feed. */}
      {p.reviews.length > 0 && (
        <section className="card p-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
            <div className="eyebrow">Featured reviews</div>
            <div className="text-[10px] text-[var(--color-muted-2)]">Google&apos;s &ldquo;most helpful&rdquo; picks — not your latest</div>
          </div>
          <p className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-ink-3)]">
            Google&apos;s API only exposes these ~{p.reviews.length} relevance-ranked reviews — your most recent reviews won&apos;t appear here, so the dates below aren&apos;t a recency signal.
            {(p.reviewCount ?? 0) > 0 && <> This profile has <strong>{(p.reviewCount ?? 0).toLocaleString()}</strong> reviews total{p.rating != null ? <> at <strong>{p.rating.toFixed(1)}★</strong></> : null}.</>}
          </p>
          <ul className="space-y-3">
            {p.reviews.map((rv, i) => (
              <li key={i} className="border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="font-semibold text-[var(--color-ink)]">{rv.authorName ?? "Anonymous"}</span>
                  {rv.rating != null && <span style={{ color: "var(--color-yellow)" }}>{"★".repeat(Math.round(rv.rating))}</span>}
                  <span className="text-[var(--color-muted-2)]">{rv.relativeTime ?? ""}</span>
                </div>
                {rv.text && <p className="mt-1 line-clamp-3 text-[12.5px] text-[var(--color-ink-3)]">{rv.text}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Closing conversion CTA */}
      <section className="card p-5" style={{ background: "var(--color-ink)" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: "#fff" }}>
              {result.moneyLeft.lostActionsPerMonth > 0
                ? `This profile is leaving an estimated ~${result.moneyLeft.lostCallsPerMonth} call${result.moneyLeft.lostCallsPerMonth === 1 ? "" : "s"} a month on the table.`
                : "Your profile is strong — let's keep it ahead of the competition."}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
              {CONTACT_PITCH}
            </p>
          </div>
          {/* Hidden entirely when NEXT_PUBLIC_CONTACT_URL is unset — a dead
              button is worse than no button. */}
          {CONTACT_URL && (
            <a
              href={CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="no-print shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold transition hover:-translate-y-px hover:shadow-lg"
              style={{ background: "var(--color-surface)", color: "var(--color-ink)" }}
            >
              {CONTACT_CTA}
            </a>
          )}
        </div>
      </section>

      {/* Export */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border-2)] bg-[var(--color-surface)] px-4 py-3 text-[11px] text-[var(--color-muted)]">
        <div>Save this report — print to PDF to keep it or share it.</div>
        <button
          onClick={() => window.print()}
          className="rounded-full border border-[var(--color-border-2)] px-3 py-1 text-[11px] font-medium transition hover:border-[var(--color-ink)]"
          style={{ color: "var(--color-ink-3)" }}
        >
          Print / Save as PDF
        </button>
      </div>
    </motion.div>
  );
}

function Chip({ label, tone }: { label: string; tone: "green" | "red" | "neutral" }) {
  const c = tone === "green" ? { bg: "var(--color-green-soft)", fg: "var(--color-green)" } : tone === "red" ? { bg: "var(--color-red-soft)", fg: "var(--color-red)" } : { bg: "var(--color-bg-2)", fg: "var(--color-ink-3)" };
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: c.bg, color: c.fg }}>{label}</span>;
}

function AttrGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-3)]">{label}</div>
      {items.length === 0 ? (
        // NEUTRAL, not red — Google omits most attribute booleans for many
        // verticals (esp. hotels), so an empty group is "not reported", not a
        // confirmed gap. Rendering it red would be a false-negative (rule #1).
        <div className="mt-1 text-[11.5px] text-[var(--color-muted-2)]">none reported</div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1">{items.map((it) => <span key={it} className="rounded bg-[var(--color-green-soft)] px-1.5 py-0.5 text-[10.5px]" style={{ color: "var(--color-green)" }}>{it}</span>)}</div>
      )}
    </div>
  );
}

const SEV_STYLE: Record<GmbFinding["severity"], { label: string; bg: string; fg: string }> = {
  critical: { label: "Critical", bg: "var(--color-red)", fg: "#fff" },
  high: { label: "High", bg: "var(--color-red-soft)", fg: "var(--color-red)" },
  medium: { label: "Medium", bg: "var(--color-yellow-soft)", fg: "#b87b00" },
  low: { label: "Low", bg: "var(--color-bg-2)", fg: "var(--color-ink-3)" },
};
const EFFORT_LABEL: Record<GmbFinding["effort"], string> = { quick: "Quick win", week: "This week", strategic: "Strategic" };

function FindingRow({ f }: { f: GmbFinding }) {
  const sev = SEV_STYLE[f.severity];
  return (
    <li className="border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide" style={{ background: sev.bg, color: sev.fg }}>{sev.label}</span>
        <span className="text-[13px] font-semibold text-[var(--color-ink)]">{f.title}</span>
        <span className="rounded-full bg-[var(--color-bg-2)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--color-muted-2)]">{f.dimension}</span>
        <span className="ml-auto text-[9.5px] font-medium text-[var(--color-muted-2)]">{EFFORT_LABEL[f.effort]}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">{f.plainEnglish}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-3)]"><span className="font-semibold text-[var(--color-ink)]">Fix:</span> {f.fix}</p>
      {f.impact && <p className="mt-1 text-[10.5px] text-[var(--color-muted-2)]">{f.impact}</p>}
    </li>
  );
}

function ActionPlan({ findings }: { findings: GmbFinding[] }) {
  if (findings.length === 0) {
    return (
      <section className="card border-[var(--color-green-soft)] p-5" style={{ background: "var(--color-green-soft)" }}>
        <div className="eyebrow mb-1" style={{ color: "var(--color-green)" }}>Action plan</div>
        <p className="text-[13px] text-[var(--color-ink-3)]">No material issues found — this profile is well kept. Keep reviews, photos, and posts fresh to hold the position.</p>
      </section>
    );
  }
  const critical = findings.filter((f) => f.severity === "critical");
  const quick = findings.filter((f) => f.severity !== "critical" && f.effort !== "strategic");
  const strategic = findings.filter((f) => f.severity !== "critical" && f.effort === "strategic");

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Your action plan</h2>
        <span className="text-[10px] text-[var(--color-muted-2)]">{findings.length} finding{findings.length === 1 ? "" : "s"}, ranked by severity</span>
      </div>

      {critical.length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--color-red-soft)] p-4" style={{ background: "var(--color-red-soft)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-red)" }}>Fix first — critical</div>
          <ul className="mt-2.5 space-y-3">{critical.map((f) => <FindingRow key={f.id} f={f} />)}</ul>
        </div>
      )}

      {quick.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-3)]">Fix today — quick wins</div>
          <ul className="mt-2.5 space-y-3">{quick.map((f) => <FindingRow key={f.id} f={f} />)}</ul>
        </div>
      )}

      {strategic.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-accent-line)] p-4" style={{ background: "var(--color-accent-soft)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-accent)" }}>Strategic — where an agency moves the needle</div>
          <ul className="mt-2.5 space-y-3">{strategic.map((f) => <FindingRow key={f.id} f={f} />)}</ul>
        </div>
      )}
    </section>
  );
}

function ScoreCard({ v }: { v: DimensionVerdict }) {
  const grade = scoreToGrade(v.score);
  const c = gradeColor(grade);
  return (
    <div className="card p-3.5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{v.label}</span>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none" style={{ background: c.bg, color: c.fg }}>{grade}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1"><span className="text-[20px] font-bold tabular-nums text-[var(--color-ink)]">{v.score}</span><span className="text-[10px] font-medium text-[var(--color-muted-2)]">/100</span></div>
      <div className="mt-1 text-[11px] leading-snug text-[var(--color-ink-3)]">{v.oneLine}</div>
      <div className="mt-1.5 flex items-center gap-1 text-[9.5px] text-[var(--color-muted-2)]">
        <span aria-hidden style={{ color: v.status === "good" ? "var(--color-green)" : v.status === "ok" ? "var(--color-yellow)" : "var(--color-red)" }}>◆</span>
        <span>Target: {v.target}</span>
      </div>
    </div>
  );
}

function DetailCard({ label, rows }: { label: string; rows: [string, string][] }) {
  return (
    <div className="card p-4">
      <div className="eyebrow mb-2">{label}</div>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <dt className="shrink-0 text-[var(--color-ink-3)]">{k}</dt>
            <dd className={`truncate text-right font-mono text-[11.5px] ${v.startsWith("—") ? "text-[var(--color-red)]" : "text-[var(--color-ink-2)]"}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CompletenessCard({ items }: { items: Array<{ item: string; present: boolean; impactHint: string; fixHint: string }> }) {
  const done = items.filter((i) => i.present).length;
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="eyebrow">Completeness</div>
        <div className="text-[10px] text-[var(--color-muted-2)]">{done} / {items.length} fields</div>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.item} className="text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--color-ink-3)]">{it.item}</span>
              <span className="shrink-0 text-[12px]" style={{ color: it.present ? "var(--color-green)" : "var(--color-red)" }}>{it.present ? "✓" : "✗ missing"}</span>
            </div>
            {!it.present && (
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted-2)]">
                {it.impactHint} <span className="text-[var(--color-ink-3)]">Fix: {it.fixHint}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GradeChip({ grade, large = false }: { grade: Grade; large?: boolean }) {
  const c = gradeColor(grade);
  const size = large ? "h-20 w-20 text-[32px]" : "h-10 w-10 text-[16px]";
  return <div className={`${size} grid place-items-center rounded-2xl font-bold leading-none`} style={{ background: c.bg, color: c.fg }} title={`Grade ${grade}`}>{grade}</div>;
}

// The grade ramp is a SEMANTIC scale and must not borrow the brand accent:
// a vermilion "B" sitting beside a red "F" reads as a second alarm. B gets its
// own calm teal so the ramp descends green → teal → yellow → amber → red.
function gradeColor(grade: Grade): { bg: string; fg: string } {
  switch (grade) {
    case "A+": case "A": return { bg: "var(--color-green)", fg: "#fff" };
    case "B": return { bg: "var(--color-teal)", fg: "#fff" };
    case "C": return { bg: "var(--color-yellow)", fg: "oklch(0.23 0.02 62)" };
    case "D": return { bg: "var(--color-amber)", fg: "#fff" };
    default: return { bg: "var(--color-red)", fg: "#fff" };
  }
}
