import { NextRequest, NextResponse } from "next/server";

const BASE = "https://exercisedb.p.rapidapi.com";

export async function GET(req: NextRequest) {
  const bodyPart = req.nextUrl.searchParams.get("bodyPart");
  const limit = req.nextUrl.searchParams.get("limit") ?? "15";
  const offset = req.nextUrl.searchParams.get("offset") ?? "0";
  if (!bodyPart) {
    return NextResponse.json({ error: "bodyPart is required" }, { status: 400 });
  }

  const headers = {
    "X-RapidAPI-Key": process.env.EXERCISEDB_KEY ?? "",
    "X-RapidAPI-Host": "exercisedb.p.rapidapi.com",
  };

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `${BASE}/exercises/bodyPart/${encodeURIComponent(bodyPart)}?limit=${limit}&offset=${offset}`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
    // RapidAPI's plan tier here has a tight per-second rate limit — bursts
    // (e.g. the workout generator paging several body parts at once) can
    // trip 429/403 even with valid quota. Retry once after a short backoff.
    if ((res.status === 429 || res.status === 403) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    return NextResponse.json({ error: `ExerciseDB error ${res.status}` }, { status: res.status });
  }
}
