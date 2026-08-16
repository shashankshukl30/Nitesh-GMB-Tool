// Competitor battlecard endpoint.
//
// Heavier than a profile audit — it resolves the target, pulls a geometric pool
// of nearby businesses, tier-matches them and optionally runs a co-ranking
// probe. That is many Places calls per run, so the rate limit is tighter than
// the profile route's and the co-rank probe is skipped once the day's soft cap
// is reached (see lib/quota.ts). Same error and stripping discipline as the
// profile route.

import { NextRequest, NextResponse } from "next/server";
import { runBattlecard } from "@/lib/gmb/battlecard";
import { rateLimit, clientIp, bodyUnder } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`competitor:${ip}`, 4, 10 * 60_000)) {
    return NextResponse.json({ error: "Rate limit — try again in a few minutes." }, { status: 429 });
  }
  if (!bodyUnder(req, 4096)) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }

  let body: { query?: string; keyword?: string };
  try {
    body = (await req.json()) as { query?: string; keyword?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim().slice(0, 600) : "";
  const keyword = typeof body.keyword === "string" ? body.keyword.trim().slice(0, 120) : undefined;
  if (query.length < 2) {
    return NextResponse.json({ error: "Paste a Google Maps URL or a business name (add the city)." }, { status: 400 });
  }

  try {
    const result = await runBattlecard(query, keyword ? { keyword } : undefined);
    return NextResponse.json({ ok: true, result: { ...result, pitchAngles: [] } });
  } catch (e) {
    logError("api/competitor", e, { stage: "engine" });
    return NextResponse.json({ error: "Competitor lookup failed — please try again in a moment." }, { status: 500 });
  }
}
