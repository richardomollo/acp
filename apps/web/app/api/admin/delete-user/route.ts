import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Verify the caller is a signed-in admin (role = 'admin' in users table)
async function getCallerRole(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await adminSupabase.auth.getUser(token);
  if (error || !user) return null;
  const { data } = await adminSupabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return data?.role ?? null;
}

export async function DELETE(request: Request) {
  try {
    const role = await getCallerRole(request);
    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, type } = await request.json();
    if (!userId || !type) {
      return NextResponse.json({ error: "Missing userId or type" }, { status: 400 });
    }

    if (type === "partner") {
      // Delete gym + sessions + bookings via cascade, then auth user
      await adminSupabase.from("sessions").delete().eq("gym_id", userId);
      await adminSupabase.from("gyms").delete().eq("id", userId);
      const { error } = await adminSupabase.auth.admin.deleteUser(userId);
      if (error) throw error;
    } else {
      // Delete bookings, then user record, then auth user
      await adminSupabase.from("bookings").delete().eq("user_id", userId);
      await adminSupabase.from("users").delete().eq("id", userId);
      const { error } = await adminSupabase.auth.admin.deleteUser(userId);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Deletion failed" }, { status: 500 });
  }
}
