"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { GmbResult } from "@/lib/gmb/types";
import type { BattlecardResult } from "@/lib/gmb/battlecard";
import { Report } from "./report";
import { BattlecardView } from "./battlecard-view";
import { BRAND } from "@/lib/site";

// A reload should land at the top of the page, not wherever the visitor had
// scrolled to in a previous report. Set at module scope so it applies before
// the browser restores position.
if (typeof window !== "undefined") {
  window.history.scrollRestoration = "manual";
}

type Mode = "profile" | "competitors";

const MODES: Array<{
  key: Mode;
  label: string;
  endpoint: string;
  cta: string;
  loadingMsg: string;
  blurb: string;
}> = [
  {
    key: "profile",
    label: "Profile health",
    endpoint: "/api/profile",
    cta: "Audit this profile",
    loadingMsg: "Reading the Google Business Profile…",
    blurb: "A full health score with the exact gaps costing you calls — and what to fix first.",
  },
  {
    key: "competitors",
    label: "Competitors",
    endpoint: "/api/competitor",
    cta: "Show the competitors",
    loadingMsg: "Finding the businesses Google ranks against you…",
    blurb: "Your true local rivals, tier-matched — who you actually compete with, and where you lose.",
  },
];

// What the report reads. Shown in the hero so the value is legible before the
// visitor has typed anything.
const SIGNALS = [
  ["Categories", "primary + secondary"],
  ["Reviews", "rating, volume, sentiment"],
  ["Photos", "count and coverage"],
  ["Hours", "regular, special, holiday"],
  ["Attributes", "access, payments, parking"],
  ["Completeness", "site, phone, description"],
];

export default function Tool() {
  const [mode, setMode] = useState<Mode>("profile");
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GmbResult | null>(null);
  const [bcResult, setBcResult] = useState<BattlecardResult | null>(null);
  const reduce = useReducedMotion();
  const active = MODES.find((m) => m.key === mode)!;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const target = query.trim();
    if (!target || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setBcResult(null);
    try {
      const r = await fetch(active.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "competitors" && keyword.trim() ? { query: target, keyword: keyword.trim() } : { query: target },
        ),
      });
      const raw = await r.text();
      let data: { ok?: boolean; result?: GmbResult | BattlecardResult; error?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        setError(`Couldn't read the response (HTTP ${r.status}). Try again.`);
        return;
      }
      if (!r.ok || !data.ok || !data.result) {
        setError(data.error ?? `Lookup failed (HTTP ${r.status})`);
        return;
      }
      if (mode === "competitors") setBcResult(data.result as BattlecardResult);
      else setResult(data.result as GmbResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    setError(null);
    setResult(null);
    setBcResult(null);
  }

  const rise = reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="min-h-dvh">
      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-5 py-4 md:px-8">
          {/* Next no-ops a Link to the route you're already on, so the brand
              would do nothing on the only page this app has. Handle the
              same-route click ourselves and scroll to top. */}
          <Link
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
            }}
            aria-label={`${BRAND.name} — back to top`}
            className="font-[family-name:var(--font-display)] text-[19px] font-semibold tracking-tight text-[var(--color-ink)] transition-opacity hover:opacity-70"
          >
            Connect<span style={{ color: "var(--color-accent)" }}>2</span>Click
          </Link>
          <span className="hidden text-[11px] text-[var(--color-muted)] sm:inline">{BRAND.tagline}</span>
          <span className="ml-auto text-[11px] text-[var(--color-muted-2)]">Free · no signup</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20 md:px-8">
        {/* ── Hero — asymmetric, editorial ───────────────────────────── */}
        <section className="grid grid-cols-1 gap-8 pt-12 md:grid-cols-12 md:gap-x-12 md:pt-20">
          <motion.div {...rise} transition={{ duration: 0.5 }} className="md:col-span-7">
            <p className="eyebrow" style={{ color: "var(--color-accent)" }}>
              Google Business Profile audit
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--color-ink)] sm:text-[44px] md:text-[52px]">
              Most local businesses lose calls to a profile they have never audited.
            </h1>
            <p className="mt-5 max-w-[64ch] text-[15px] leading-relaxed text-[var(--color-ink-3)]">
              Score any Google Business Profile in seconds — then see the rivals Google actually
              ranks beside it, tier-matched rather than the biggest names in town.
            </p>
          </motion.div>

          {/* Signals column — on mobile this becomes a two-up grid, not a
              stacked list, so the hero stays one screen. */}
          <motion.div
            {...rise}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.12 }}
            className="md:col-span-5 md:pt-3"
          >
            <div className="eyebrow mb-3">What it reads</div>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-1 md:gap-y-2.5">
              {SIGNALS.map(([name, detail]) => (
                <div key={name} className="border-t border-[var(--color-border)] pt-2 md:flex md:items-baseline md:justify-between md:gap-4">
                  <dt className="text-[12.5px] font-medium text-[var(--color-ink)]">{name}</dt>
                  <dd className="text-[11px] text-[var(--color-muted)] md:text-right">{detail}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </section>

        {/* ── Controls ───────────────────────────────────────────────── */}
        <section className="mt-12 md:mt-16">
          <div
            className="inline-flex rounded-full border border-[var(--color-border-2)] p-1"
            role="tablist"
            aria-label="Report type"
          >
            {MODES.map((m) => (
              <button
                key={m.key}
                role="tab"
                aria-selected={mode === m.key}
                onClick={() => switchMode(m.key)}
                className="relative rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors"
                style={{ color: mode === m.key ? "var(--color-surface)" : "var(--color-ink-3)" }}
              >
                {mode === m.key && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "var(--color-ink)" }}
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>

          <p className="mt-3 max-w-[70ch] text-[12.5px] text-[var(--color-muted)]">{active.blurb}</p>

          <form onSubmit={run} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Business name + city, or paste the Google Maps link"
              className="input flex-1"
              autoComplete="off"
              aria-label="Business name and city, or Google Maps link"
            />
            {mode === "competitors" && (
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Keyword (optional)"
                className="input sm:max-w-[210px]"
                autoComplete="off"
                aria-label="Optional search keyword"
              />
            )}
            {/* Disabled state uses a neutral fill rather than a faded accent —
                a 45%-opacity vermilion reads as a broken button, not a
                waiting one. */}
            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              className="shrink-0 rounded-xl px-5 py-2.5 text-[13px] font-semibold transition hover:-translate-y-px hover:shadow-md disabled:pointer-events-none disabled:hover:translate-y-0 disabled:hover:shadow-none"
              style={
                loading || query.trim().length < 2
                  ? { background: "var(--color-bg-2)", color: "var(--color-muted-2)", border: "1px solid var(--color-border-2)" }
                  : { background: "var(--color-accent)", color: "#fff", border: "1px solid var(--color-accent)" }
              }
            >
              {loading ? "Working…" : active.cta}
            </button>
          </form>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border px-4 py-3 text-[13px]"
              style={{
                color: "var(--color-red)",
                background: "var(--color-red-soft)",
                borderColor: "var(--color-red-soft)",
              }}
            >
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-6 flex items-center gap-2.5 text-[13px] text-[var(--color-muted)]" aria-live="polite">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border-2)] border-t-[var(--color-accent)]" />
              {active.loadingMsg}
            </div>
          )}
        </section>

        {/* ── Results ────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {!loading && result && mode === "profile" && (
            <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Report result={result} />
            </motion.div>
          )}
          {!loading && bcResult && mode === "competitors" && (
            <motion.div key="competitors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <BattlecardView result={bcResult} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11px] text-[var(--color-muted-2)] md:px-8">
          <span>
            Data from the Google Places API. No account, no email captured, nothing stored.
          </span>
          <span>
            © {new Date().getFullYear()} {BRAND.name}
          </span>
        </div>
      </footer>
    </div>
  );
}
