// Profile health endpoint.
//
// Public by design — there is no login, because there is nothing to log in to:
// the tool stores nothing about anyone. What that costs is a spend surface, so
// this route is defended on four fronts:
//
//   rate limit  — 5 runs per 10 minutes per IP
//   body cap    — 4KB, well under the platform ceiling
//   input cap   — query truncated to 600 chars before it reaches the engine
//   generic errors — Google's error bodies quote quota and key state, so the
//                    detail is logged server-side and never returned
//
// No SSRF surface: the only outbound call is to Google's fixed endpoint, and
// the visitor's text is used solely as a search string.

import { NextRequest, NextResponse } from "next/server";
import { runGmbAudit } from "@/lib/gmb/engine";
import { rateLimit, clientIp, bodyUnder } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`profile:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "Rate limit — try again in a few minutes." }, { status: 429 });
  }
  if (!bodyUnder(req, 4096)) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }

  let body: { query?: string };
  try {
    body = (await req.json()) as { query?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim().slice(0, 600) : "";
  if (query.length < 2) {
    return NextResponse.json({ error: "Paste a Google Maps URL or a business name (add the city)." }, { status: 400 });
  }

  try {
    const result = await runGmbAudit(query);
    // `pitchAngles` is operator-facing sales framing. This page is shown to the
    // business being audited, so it never leaves the server.
    return NextResponse.json({ ok: true, result: { ...result, pitchAngles: [] } });
  } catch (e) {
    logError("api/profile", e, { stage: "engine" });
    return NextResponse.json({ error: "Lookup failed — please try again in a moment." }, { status: 500 });
  }
}
