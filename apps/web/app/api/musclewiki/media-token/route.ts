import { NextResponse } from "next/server";

// ACP Intelligence™ — server-side MuscleWiki media-token issuer.
//
// Verified live: musclewiki.com/stream/... media URLs require auth (a bare
// GET returns 401). MuscleWiki's documented pattern is: the permanent
// X-API-Key calls POST /media/token here (server-side only) and gets back a
// short-lived (verified: 15-minute) token; that token — never the permanent
// key — is handed to the mobile client, which appends it as
// `?token=<token>` on the stream URL. Confirmed live: a stream URL with the
// token query param appended returns 200.
const BASE = "https://api.musclewiki.com";
const REQUEST_TIMEOUT_MS = 8000;

export async function POST() {
  const apiKey = process.env.MUSCLEWIKI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MuscleWiki is not configured" }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}/media/token`, {
      method: "POST",
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json({ error: "MuscleWiki media-token request timed out" }, { status: 504 });
    }
    console.error("MuscleWiki media-token proxy network error", e); // never logs the key itself
    return NextResponse.json({ error: "MuscleWiki media-token request failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error(`MuscleWiki media-token upstream error ${res.status}`);
    return NextResponse.json({ error: `MuscleWiki error ${res.status}` }, { status: res.status });
  }

  try {
    const data = await res.json(); // { token, expires_in } — the short-lived token only, safe to hand to mobile
    return NextResponse.json(data);
  } catch (e) {
    console.error("MuscleWiki media-token proxy malformed response", e);
    return NextResponse.json({ error: "MuscleWiki returned a malformed response" }, { status: 502 });
  }
}
