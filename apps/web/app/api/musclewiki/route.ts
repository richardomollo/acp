import { NextRequest, NextResponse } from "next/server";

// ACP Intelligence™ — server-side MuscleWiki proxy.
//
// Beta Readiness Step 1: the real MuscleWiki contract has been live-
// validated with a real credential (see the completion report for the exact
// requests made). Confirmed real: base URL, X-API-Key auth (not Bearer —
// Day 1's original assumption was wrong), GET /search (bare array, full
// exercise detail, supports q/category/difficulty), GET /exercises/{id}
// (bare object, full detail). GET /exercises (list, no id) only returns
// {id, name} per result with no working muscle filter, so the mobile
// provider never calls it for real browsing — see
// apps/mobile/services/providers/musclewiki-provider.ts.
//
// MUSCLEWIKI_API_KEY is read server-side only — never exposed as
// NEXT_PUBLIC_*/EXPO_PUBLIC_* or in any client bundle, and never logged.
const BASE = "https://api.musclewiki.com";
const REQUEST_TIMEOUT_MS = 8000;

export async function GET(req: NextRequest) {
  const apiKey = process.env.MUSCLEWIKI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MuscleWiki is not configured" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const path = params.get("path"); // 'search' or 'exercises/{id}' — never client-controlled beyond this proxy's own two callers
  if (!path || !/^(search|exercises\/[\w-]+)$/.test(path)) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const upstream = new URLSearchParams();
  for (const key of ["q", "category", "difficulty", "limit", "offset"]) {
    const v = params.get(key);
    if (v) upstream.set(key, v);
  }
  const qs = upstream.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}${qs ? `?${qs}` : ""}`, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json({ error: "MuscleWiki request timed out" }, { status: 504 });
    }
    console.error("MuscleWiki proxy network error", e); // never logs the key itself
    return NextResponse.json({ error: "MuscleWiki request failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error(`MuscleWiki upstream error ${res.status} for path=${path}`);
    return NextResponse.json({ error: `MuscleWiki error ${res.status}` }, { status: res.status });
  }

  try {
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("MuscleWiki proxy malformed response", e);
    return NextResponse.json({ error: "MuscleWiki returned a malformed response" }, { status: 502 });
  }
}
