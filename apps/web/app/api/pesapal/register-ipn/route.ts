// One-time setup: GET /api/pesapal/register-ipn?secret=<PESAPAL_SETUP_SECRET>
// Returns the ipn_id — set it as PESAPAL_IPN_ID in your env vars.
import { NextRequest, NextResponse } from "next/server";
import { registerIPN } from "@/app/lib/pesapal";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.PESAPAL_SETUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://activecitypass.com";
  const ipnUrl = `${baseUrl}/api/pesapal/ipn`;

  try {
    const ipnId = await registerIPN(ipnUrl);
    return NextResponse.json({
      ipn_id: ipnId,
      ipn_url: ipnUrl,
      next_step: `Add PESAPAL_IPN_ID=${ipnId} to your environment variables`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
