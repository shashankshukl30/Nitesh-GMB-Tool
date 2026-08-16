// Competitor view — renders runBattlecard() output: a sorted scoreboard with
// the target highlighted in its TRUE position, plus honest "where you lose /
// lead" callouts.
//
// The honesty rules here are load-bearing. When our own fetch fails, the empty
// result is rendered as OUR fault ("couldn't read the local market"), never as
// a finding about the client's market — a thin competitor list caused by an
// outage must never be presented as "you have few competitors".

"use client";

import { motion } from "motion/react";
import type { BattlecardResult, BattlecardEntry } from "@/lib/gmb/battlecard";

const gradeTone = (g: string) =>
  g.startsWith("A") ? "var(--color-green)" : g.startsWith("B") ? "var(--color-teal)" : g.startsWith("C") ? "var(--color-yellow)" : "var(--color-red)";

const webLabel = (q: BattlecardEntry["profile"]["websiteQuality"]) =>
  q === "real" ? "Real site" : q === "free-host" ? "Free host" : q === "social-only" ? "Social only" : "None";

function photoLabel(e: BattlecardEntry) {
  const p = e.profile;
  return p.photoCount == null ? "0" : p.photosCapped ? "10+" : String(p.photoCount);
}

// Price tier — the real meta-price range when Google has it (e.g. "₹2,500–4,000"),
// else the coarse tier as ₹ symbols, else unknown. This is the signal the peer
// matcher leans on, so showing it makes the compset defensible.
function TierTable({ title, subtitle, rows, broader }: { title: string; subtitle: string; rows: BattlecardEntry[]; broader?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section className="card overflow-x-auto p-0">
      <div className="border-b border-[var(--color-border)] px-3 py-2.5">
        <div className="text-[12px] font-semibold text-[var(--color-ink)]">{title}</div>
        <div className="text-[10.5px] text-[var(--color-muted-2)]">{subtitle}</div>
      </div>
      <table className="w-full min-w-[680px] border-collapse text-[12.5px]">
        <tbody>
          {rows.map((e, i) => {
            const me = e.isTarget;
            return (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0" style={me ? { background: "var(--color-accent-soft)" } : undefined}>
                <td className="px-3 py-2.5 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={me ? "font-bold text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}>{e.profile.name}</span>
                    {me && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: "var(--color-ink)", color: "#fff" }}>You</span>}
                    {e.tierLabel && (
                      <span className="rounded-full bg-[var(--color-bg-2)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-muted-2)]" title="Tier inferred from name + prominence + amenities; Google's API does not expose hotel price">
                        {e.tierLabel}{e.tierConfidence === "low" ? " ?" : ""}
                      </span>
                    )}
                  </div>
                  {!me && (broader ? e.whyBroader : e.peerEvidence) && (
                    <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--color-muted-2)]">{broader ? e.whyBroader : e.peerEvidence}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center align-top font-semibold" style={{ color: gradeTone(e.grade) }}>{e.scores.overall}</td>
                <td className="px-3 py-2.5 text-center align-top text-[var(--color-ink-3)]">{e.profile.rating != null ? `${e.profile.rating.toFixed(1)}★` : "—"}</td>
                <td className="px-3 py-2.5 text-center align-top text-[var(--color-ink-3)]">{(e.profile.reviewCount ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-center align-top text-[var(--color-ink-3)]">{photoLabel(e)}</td>
                <td className="px-3 py-2.5 text-center align-top text-[var(--color-ink-3)]">{webLabel(e.profile.websiteQuality)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function BattlecardView({ result }: { result: BattlecardResult }) {
  if (!result.found || !result.target) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card mt-6 px-6 py-8 text-center text-[13px] text-[var(--color-ink-3)]">
        {result.reason ?? "Couldn’t find that business."}
      </motion.div>
    );
  }

  const t = result.target;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
      {/* Header */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[18px] font-semibold text-[var(--color-ink)]">{t.profile.name}</div>
            <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">
              {t.profile.category ?? "—"} · benchmarked against {result.competitors.length} true peer{result.competitors.length === 1 ? "" : "s"}
              {result.rivalsPicked > result.competitors.length && (
                <span className="text-[var(--color-muted-2)]"> ({result.rivalsPicked - result.competitors.length} more nearby couldn’t be read)</span>
              )}
            </div>
            {result.keyword && result.poolSource === "co-ranking" && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-2.5 py-1 text-[11px] text-[var(--color-ink-3)]">
                <span aria-hidden style={{ color: "var(--color-accent)" }}>◎</span>
                <span className="text-[var(--color-muted-2)]">Competitors who rank for</span>
                <span className="font-semibold text-[var(--color-ink)]">“{result.keyword}”</span>
              </div>
            )}
          </div>
          {result.ranks && (
            <div className="text-right">
              <div className="text-[26px] font-bold leading-none" style={{ color: gradeTone(t.grade) }}>#{result.ranks.overall}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-muted-2)]">of {result.ranks.total} on health</div>
            </div>
          )}
        </div>
      </section>

      {result.poolSource === "unavailable" ? (
        // Our fetch failed. This is NOT a finding about the client's market —
        // rendering it as one ("a thin competitive area") would be a false
        // claim caused by our own outage. Styled as a fault, not a verdict.
        <section className="card p-5 text-[13px] text-[var(--color-ink-3)]" style={{ borderColor: "var(--color-yellow)", background: "var(--color-yellow-soft)" }}>
          <div className="mb-1 font-semibold text-[var(--color-ink)]">Couldn’t read the local market</div>
          {result.peerBasis}
        </section>
      ) : result.competitors.length === 0 ? (
        <section className="card p-5 text-[13px] text-[var(--color-ink-3)]">
          {result.peerBasis ||
            "No genuinely comparable competitors sit near this location. Rather than pad the list with off-category or out-of-league businesses, we show nothing — a thin competitive area is itself a finding. Try the single-profile audit instead."}
        </section>
      ) : (
        <>
          {/* Share of Local Voice — salvaged from the co-ranking probes */}
          {result.targetSolv != null && (
            <section className="rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted-2)]">Share of local voice</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
                You appear in the top 3 for <span className="font-semibold text-[var(--color-ink)]">“{result.keyword}”</span> at <span className="font-semibold text-[var(--color-ink)]">{result.targetSolv}%</span> of nearby search points.
                {result.ceilingPeer && <> {result.ceilingPeer.name} leads at <span className="font-semibold text-[var(--color-ink)]">{result.ceilingPeer.solv}%</span> — the realistic ceiling in this area.</>}
              </p>
              {result.tierDistribution && <p className="mt-1.5 text-[11px] text-[var(--color-muted-2)]">Area mix: {result.tierDistribution}.</p>}
            </section>
          )}

          {/* Tier 1 — your league */}
          <TierTable
            title="Your league — true peers"
            subtitle="Co-rank with you AND in your tier and review base."
            rows={[t, ...result.tier1].sort((a, b) => b.scores.overall - a.scores.overall)}
          />

          {/* Tier 2 — broader market */}
          {result.tier2.length > 0 && (
            <TierTable
              title="Broader market"
              subtitle="Same area & category, but an adjacent tier or not co-ranking — context, not direct peers."
              rows={result.tier2}
              broader
            />
          )}

          {/* Weaker-match warning when there was no co-ranking data to anchor on */}
          {result.poolSource === "fallback-geometry" && (
            <section className="rounded-xl border border-[var(--color-amber-soft,var(--color-border-2))] bg-[var(--color-bg-2)] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-amber, var(--color-muted-2))" }}>Weaker match</div>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-3)]">Google returned no co-ranking data for this area, so these are the closest same-category, same-league listings — a reasonable but less precise peer set than a co-ranked one.</p>
            </section>
          )}

          {/* Peer-set basis — makes the compset defensible to a prospect */}
          {result.peerBasis && (
            <p className="px-1 text-[11px] leading-relaxed text-[var(--color-muted)]">
              <span className="font-semibold text-[var(--color-ink-3)]">How this set was chosen:</span> {result.peerBasis}
              {result.rejectedCount > 0 && (
                <span className="text-[var(--color-muted-2)]"> {result.rejectedCount} other nearby business{result.rejectedCount === 1 ? "" : "es"} excluded (off-category, out-of-league, or duplicate brand).</span>
              )}
            </p>
          )}

          {/* Market-leader context — the area's giant, honestly flagged as a different tier */}
          {result.marketLeader && (
            <section className="rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted-2)]">Area leader · different tier</div>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-3)]">{result.marketLeader.note}</p>
            </section>
          )}

          {/* Where you lose */}
          {result.losesTo.length > 0 && (
            <section className="card border-[var(--color-red-soft)] p-5" style={{ background: "var(--color-red-soft)" }}>
              <div className="eyebrow mb-2" style={{ color: "var(--color-red)" }}>Where you’re losing</div>
              <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
                {result.losesTo.map((g, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--color-red)", color: "#fff" }}>{g.dimension}</span>
                    <span>{g.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Where you lead */}
          {result.wins.length > 0 && (
            <section className="card border-[var(--color-green-soft)] p-5" style={{ background: "var(--color-green-soft)" }}>
              <div className="eyebrow mb-2" style={{ color: "var(--color-green)" }}>Where you lead</div>
              <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
                {result.wins.map((w, i) => (
                  <li key={i} className="flex gap-2"><span aria-hidden className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--color-green)" }} /><span>{w}</span></li>
                ))}
              </ul>
            </section>
          )}

          {/* Operator-facing `pitchAngles` are deliberately not rendered — see
              the note in report.tsx. They are also stripped in the API layer. */}

          {/* Export */}
          <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border-2)] bg-[var(--color-surface)] px-4 py-3 text-[11px] text-[var(--color-muted)]">
            <div>A side-by-side comparison is the most persuasive thing to put in front of a decision — print it to PDF.</div>
            <button onClick={() => window.print()} className="rounded-full border border-[var(--color-border-2)] px-3 py-1 text-[11px] font-medium transition hover:border-[var(--color-ink)]" style={{ color: "var(--color-ink-3)" }}>
              Print / Save as PDF
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
