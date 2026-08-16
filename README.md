# Connect2Click

A Google Business Profile audit tool. Enter a business, get a graded health
report in about 30 seconds — plus the local competitors Google actually ranks
it against.

Live at **https://connect2click.com**

---

## What it does

**Profile health** — resolves a business from a name or a Google Maps link, then
scores it 0–100 across six weighted dimensions and returns a letter grade:

| Dimension | Weight | What it measures |
|---|--:|---|
| Reviews | 25 | Rating quality (70%) + volume (30%) |
| Completeness | 22 | Website, phone, description, hours, photos, category |
| Attributes | 16 | Accessibility, payments, parking, amenities, services |
| Hours | 15 | Days set, special/holiday hours |
| Photos | 12 | Gallery depth |
| Categories | 10 | Primary + secondary category use |

Output includes a ranked action plan (severity + effort), a "money left on the
table" estimate, review-theme intelligence, an attribute matrix, and a printable
report.

**Competitors** — finds the businesses that genuinely compete with the target
(tier-matched by class, price band and category, not just the biggest names
nearby), scores each on the same scale, and ranks the target among them.
Supply an optional keyword and it additionally probes who co-ranks for that
term and reports a share-of-local-voice figure.

---

## Architecture

```
app/
  page.tsx              the tool (server) → components/tool.tsx (client)
  layout.tsx            metadata, fonts, JSON-LD
  globals.css           ALL design tokens — rebrand happens here
  api/profile/          POST → profile health
  api/competitor/       POST → competitor comparison
components/
  tool.tsx              shell, hero, tabs, form
  report.tsx            the health report
  battlecard-view.tsx   the competitor view
lib/
  gmb/                  the scoring engine (16 modules)
  grade.ts              score → letter grade
  quota.ts              Places API spend brake
  rate-limit.ts         in-memory per-IP limiter
  log.ts                structured server-side error logging
  site.ts               brand, contact CTA, canonical URL
```

**There is no database.** Nothing about a visitor or a searched business is
stored — every request is computed fresh and discarded. That is a deliberate
design choice: it removes an entire category of cost, privacy obligation and
operational risk, and it is why the tool needs no accounts or logins.

**One external dependency:** the Google Places API (New). Nothing else. No
analytics vendor, no error-tracking service, no CDN for fonts (they are
self-hosted by `next/font`), no third-party scripts at all. The Content
Security Policy in `next.config.ts` is locked to `'self'` precisely because
nothing else is needed.

Stack: Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4,
Motion for animation.

---

## Running locally

```bash
npm install
cp .env.example .env.local     # then paste your Places API key
npm run dev                    # http://localhost:3000
```

`npm run typecheck` and `npm run build` should both pass before any deploy.

---

## Deploying, keys, DNS, and cost control

See **[RUNBOOK.md](./RUNBOOK.md)** — a step-by-step setup guide written for a
first-time deploy, including how to cap Google spend so it cannot run away.

---

## Rebranding

Three files, nothing else:

1. `app/globals.css` — change `--color-accent` and its two soft variants.
   Leave the semantic green/amber/red alone; they carry meaning in the report.
2. `app/layout.tsx` — swap the two `next/font` families.
3. `lib/site.ts` — name, tagline, page title, description.

Plus `public/icon.svg` and `public/og.png` for the tab icon and social preview.

---

## Two rules the report must keep

These came out of real failures and are commented in the source where they
apply. If you change the report, do not break them:

1. **Never render our own failure as a fact about the business.** If a Google
   call fails, say the lookup failed. Rendering an empty competitor list as
   "you have few competitors", or an unreported attribute group as a red gap,
   states something false about someone's business.
2. **Never imply data Google does not give us.** The Places API returns ~5
   relevance-ranked reviews, never the newest, and caps the photo array at 10
   with no total. So the reviews block is labelled a sample rather than a
   recency feed, and 10 photos is shown as "10+".
