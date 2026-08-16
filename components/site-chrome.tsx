"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { BRAND, CONTACT_EMAIL } from "@/lib/site";

// A reload should land at the top of the page, not wherever the visitor had
// scrolled to in a previous report. Set at module scope so it applies before
// the browser restores position.
if (typeof window !== "undefined") {
  window.history.scrollRestoration = "manual";
}

/**
 * Masthead shared by every page.
 *
 * The nav slot always offers the *other* page, so there is a next action
 * wherever you are: the tool links to Contact, Contact links back to the tool.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const onHome = pathname === "/";

  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-5 py-4 md:px-8">
        {/* Next no-ops a Link to the route you're already on, so on the home
            page the brand would do nothing. Handle that click ourselves. */}
        <Link
          href="/"
          onClick={(e) => {
            if (!onHome) return;
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
          }}
          aria-label={`${BRAND.name} — ${onHome ? "back to top" : "home"}`}
          className="font-[family-name:var(--font-display)] text-[19px] font-semibold tracking-tight text-[var(--color-ink)] transition-opacity hover:opacity-70"
        >
          Connect<span style={{ color: "var(--color-accent)" }}>2</span>Click
        </Link>

        <span className="hidden text-[11px] text-[var(--color-muted)] sm:inline">{BRAND.tagline}</span>

        <nav className="ml-auto flex items-baseline gap-4">
          <Link
            href={onHome ? "/contact" : "/"}
            className="text-[11px] font-medium text-[var(--color-ink-3)] underline decoration-[var(--color-border-2)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
          >
            {onHome ? "Contact" : "Run an audit"}
          </Link>
          {/* Dropped below sm so the header never wraps on a 390px screen. */}
          <span className="hidden text-[11px] text-[var(--color-muted-2)] sm:inline">Free · no signup</span>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11px] text-[var(--color-muted-2)] md:px-8">
        <span>Data from the Google Places API. No account, no email captured, nothing stored.</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="transition-colors hover:text-[var(--color-accent)]"
          >
            {CONTACT_EMAIL}
          </a>
          <span aria-hidden="true">·</span>
          <span>
            © {new Date().getFullYear()} {BRAND.name}
          </span>
        </span>
      </div>
    </footer>
  );
}
