import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { name, email, phone } = await req.json();

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const BREVO_LIST_ID = process.env.BREVO_LIST_ID;

  if (!BREVO_API_KEY || !BREVO_LIST_ID) {
    return NextResponse.json({ error: "Missing API key or List ID" }, { status: 500 });
  }

  const formattedPhone = phone ? phone.replace(/[\s()-]/g, "") : undefined;

  const body = {
    email,
    attributes: { FIRSTNAME: name, ...(formattedPhone ? { SMS: formattedPhone } : {}) },
    listIds: [parseInt(BREVO_LIST_ID)],
    updateEnabled: true,
  };

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let data: any;
    try {
      data = await res.json(); // try to parse JSON
    } catch {
      data = {}; // fallback to empty object if no JSON
    }

    if (!res.ok) {
      // Brevo sometimes returns empty body with error
      const message =
        data.error?.message || data.message || "Failed to subscribe";
      return NextResponse.json({ error: { message } }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: { message: err.message || "Server error" } }, { status: 500 });
  }
}
