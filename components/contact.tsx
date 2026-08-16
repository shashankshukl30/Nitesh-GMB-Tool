"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SiteHeader, SiteFooter } from "./site-chrome";
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY } from "@/lib/site";

// The two ways to reach a human. Deliberately just two — a page offering six
// channels reads as a company that answers none of them.
const CHANNELS = [
  { label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  { label: "Phone", value: CONTACT_PHONE_DISPLAY, href: `tel:${CONTACT_PHONE}` },
];

export default function Contact() {
  const reduce = useReducedMotion();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const rise = reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-20 md:px-8">
        <section className="grid grid-cols-1 gap-10 pt-12 md:grid-cols-12 md:gap-x-12 md:pt-20">
          {/* Left — the argument for getting in touch */}
          <motion.div {...rise} transition={{ duration: 0.5 }} className="md:col-span-7">
            <p className="eyebrow" style={{ color: "var(--color-accent)" }}>
              Contact
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--color-ink)] sm:text-[40px] md:text-[46px]">
              Run the audit first. Then let&rsquo;s talk about what it found.
            </h1>
            <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-[var(--color-ink-3)]">
              The report names the gaps costing you calls. Closing them is review work, photo work,
              category and attribute work — the unglamorous part that moves a listing. That is the
              part we do.
            </p>
            <p className="mt-4 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--color-muted)]">
              Send the business name and the city in your first message and we will have the audit
              open before we reply.
            </p>
          </motion.div>

          {/* Right — the actual channels, weighted as the point of the page */}
          <motion.div
            {...rise}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.12 }}
            className="md:col-span-5 md:pt-2"
          >
            <div className="eyebrow mb-1">Reach us</div>
            <ul>
              {CHANNELS.map((c) => (
                <li key={c.label} className="border-t border-[var(--color-border)]">
                  <a
                    href={c.href}
                    className="group flex flex-col gap-0.5 py-4 transition-transform hover:translate-x-0.5"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-muted)]">
                      {c.label}
                    </span>
                    <span className="break-words font-[family-name:var(--font-display)] text-[19px] font-semibold tracking-tight text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-accent)] sm:text-[21px]">
                      {c.value}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="border-t border-[var(--color-border)] pt-4 text-[12px] leading-relaxed text-[var(--color-muted)]">
              The audit itself stays free and needs no account. Nothing you search here is stored.
            </p>
          </motion.div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
