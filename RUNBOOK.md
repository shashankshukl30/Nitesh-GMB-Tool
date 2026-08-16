# Setup runbook — Connect2Click

Everything needed to take this repository live at **connect2click.com**, on
accounts you own and pay for. Budget about 30 minutes.

The order matters: get the Google key working locally first, then deploy, then
point the domain. That way, if something breaks you always know which step
caused it.

**What you will own at the end**

| Thing | Whose account | Cost |
|---|---|---|
| Source code | Yours (this repo) | — |
| Hosting | Your Vercel account | ₹0 on the Hobby plan |
| Google Places API | Your Google Cloud project | ₹0 within the free monthly allowance |
| Domain | Your GoDaddy account | Already paid, renews Mar 2027 |
| Database | None — there isn't one | ₹0 |

There is no vendor in this stack other than Google and your host.

---

## Step 1 — Get the code

1. Sign in to GitHub and accept the transfer of this repository (or fork it).
2. Clone it locally if you want to run it on your machine:
   ```bash
   git clone <your-repo-url>
   cd connect2click
   npm install
   ```

---

## Step 2 — Google Cloud: the API key

This is the only credential the application has. Steps 2c and 2d are the ones
that make the bill impossible to run away — do not skip them.

### 2a. Create the project and enable the API

1. Go to <https://console.cloud.google.com/> and sign in.
2. Top bar → project dropdown → **New Project**. Name it `connect2click`.
3. With that project selected, go to **APIs & Services → Library**.
4. Search for **Places API (New)** and click **Enable**.
   - It must be *Places API (New)*, not the older "Places API". The tool uses
     the new endpoints and field masks.
5. Google will ask you to link a **billing account**. This is required even for
   free usage. Add a card — the free monthly allowance means you should not be
   charged, and steps 2c/2d cap it regardless.

### 2b. Create the key

1. **APIs & Services → Credentials → Create credentials → API key**.
2. Copy the key. Treat it like a password.
3. Click **Edit API key** and set both restrictions:
   - **API restrictions** → *Restrict key* → tick **Places API (New)** only.
     A key limited to one API cannot be spent on anything else.
   - **Application restrictions** → leave as **None**.
     The key is used server-side only, so an HTTP-referrer restriction would
     break it. This is safe *because* of the API restriction above — but it
     also means the key must never be committed or put in a `NEXT_PUBLIC_`
     variable, where the browser could read it.

### 2c. Cap the daily quota — the real spend ceiling

1. **APIs & Services → Places API (New) → Quotas & System Limits**.
2. Find the per-day request quotas and click the pencil icon.
3. Set a daily limit you are comfortable with. **2,000/day** is a sane start
   and comfortably covers ordinary use.
4. Save.

Google now refuses requests past that number. This is enforced on Google's
side, so it holds no matter what the application does or how much traffic
arrives. The `PLACES_DAILY_CAP` environment variable is a courtesy brake in the
app; *this* is the actual ceiling.

### 2d. Add a budget alert

1. **Billing → Budgets & alerts → Create budget**.
2. Scope it to the `connect2click` project, set a small monthly amount
   (₹500 is plenty), and add your email at 50% / 90% / 100%.

You now have: a key that can only call one API, a hard daily request cap, and
an email the moment spend is non-zero.

### 2e. Test it locally before deploying

```bash
cp .env.example .env.local
# paste the key into GOOGLE_PLACES_API_KEY
npm run dev
```

Open <http://localhost:3000>, search a business you know, and confirm a report
appears. If it does, the key is correct and the rest is just hosting.

---

## Step 3 — Deploy to Vercel

1. Sign up at <https://vercel.com/signup> with your GitHub account. The
   **Hobby plan is free** and is enough for this tool.
2. **Add New → Project** → import this repository.
3. Framework preset will auto-detect as **Next.js**. Leave the build settings
   alone.
4. Before clicking Deploy, expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `GOOGLE_PLACES_API_KEY` | your key from step 2b |
   | `NEXT_PUBLIC_SITE_URL` | `https://connect2click.com` |
   | `NEXT_PUBLIC_CONTACT_URL` | optional — see below |

   `NEXT_PUBLIC_CONTACT_URL` is where the button at the bottom of each report
   points. Use a WhatsApp link (`https://wa.me/919999999999`), a `mailto:`, or
   a booking page. **Leave it blank and the button is hidden** rather than
   rendering a dead link — so it is safe to add later.

5. Click **Deploy**. You will get a `*.vercel.app` URL in a couple of minutes.
6. Open it and run a search. Confirm a report renders before touching DNS.

> **Region (optional).** Project → Settings → Functions → set the region to
> **Mumbai (bom1)** if your users are in India. It shaves latency. Nothing
> breaks if you skip it.

---

## Step 4 — Point connect2click.com at it

`connect2click.com` is registered with GoDaddy and uses GoDaddy's nameservers
(`ns33/ns34.domaincontrol.com`), so DNS is edited in the GoDaddy dashboard.

> ⚠️ **This replaces whatever is on the domain now.** The domain currently
> serves a GoDaddy Website Builder page. Once these records change, that page
> stops being reachable. Make sure nothing on it still matters.

### 4a. Tell Vercel about the domain

1. Vercel → your project → **Settings → Domains**.
2. Add `connect2click.com`. Add `www.connect2click.com` too — Vercel will
   redirect one to the other automatically.
3. Vercel now shows you the exact records to create. **Use the values on that
   screen** — they are authoritative for your project and occasionally change.
   At the time of writing they are:

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |

### 4b. Create them in GoDaddy

1. <https://dcc.godaddy.com/manage/connect2click.com/dns>
2. **Delete or edit** any existing `A` record on `@` and any `CNAME` on `www`
   — these currently point at GoDaddy's site builder. Leave `MX` records alone
   if you use email on this domain.
3. Add the two records from 4a. TTL: 1 hour (or the default).
4. Save.

### 4c. Wait, then verify

DNS usually propagates in minutes, sometimes up to a few hours. Vercel's
Domains screen shows a green check when it sees the records and has issued the
TLS certificate. Then:

```bash
curl -sI https://connect2click.com | head -3
```

Expect `HTTP/2 200` and `server: Vercel`.

---

## Step 5 — Post-launch checks

- [ ] `https://connect2click.com` loads and returns a real report
- [ ] `https://www.connect2click.com` redirects to the apex
- [ ] The competitors tab returns results
- [ ] The report's CTA button goes where you expect (or is absent)
- [ ] Paste the URL into WhatsApp — the preview card should show `og.png`
- [ ] Submit the site at <https://search.google.com/search-console> so it can
      be indexed

---

## Running it day to day

### Costs

Realistically **₹0/month**. Vercel Hobby is free; the Places free allowance
covers ordinary use; there is no database. You would only see a bill after a
very high volume of lookups, and the step-2c quota stops that before it starts.

### The kill switch

To stop all Google calls immediately — no code change, no key rotation:

Vercel → Settings → Environment Variables → add `PLACES_DISABLED` = `1` →
redeploy. Lookups stop; the site stays up. Remove it to resume.

### Rate limits

Built in, per visitor IP: **5 profile audits** and **4 competitor lookups** per
10 minutes. Adjust in `app/api/profile/route.ts` and
`app/api/competitor/route.ts` if you need to.

### If something breaks

Vercel → your project → **Logs**. Errors are written one JSON line each with a
`scope` field (`gmb/places`, `api/profile`, `api/competitor`). The most common
causes:

| Symptom | Likely cause |
|---|---|
| Every lookup fails | Key wrong, or Places API (New) not enabled |
| Worked, then stopped | Daily quota (2c) hit — check Google Cloud quotas |
| "Rate limit" message | The per-IP limiter, working as intended |
| Report says "couldn't find" | Query too vague — add the city, or paste the Maps link |

---

## Handover checklist

Confirm each of these is true and the tool is fully yours:

- [ ] The GitHub repository is under your account
- [ ] The Vercel project is under your account, billed to you
- [ ] The Google Cloud project and API key are yours, billed to you
- [ ] The domain is in your GoDaddy account
- [ ] The daily Places quota (step 2c) is set
- [ ] A billing budget alert (step 2d) is set
- [ ] No credential in this repo — `.env.local` is git-ignored and the key
      lives only in Vercel's environment variables

Nothing in this stack depends on any account other than yours. There is no
database holding your data elsewhere, no analytics or error-tracking vendor
receiving traffic, and no license or subscription attached to the code.
