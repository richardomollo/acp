import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { rootRedirectTarget, ROOT_REDIRECT_STATUS } from "@/lib/root-redirect";

export async function proxy(request: NextRequest) {
  // LANA release hardening: host-specific root redirect
  // (activecitypass.com/ → /lana-pro/onboarding). TEMPORARY (307) so the
  // rollout is reversible. Matches ONLY pathname === '/' on those hosts — no
  // other route, host, or API path is affected, and the destination is not
  // '/', so there is no loop.
  const rootTarget = rootRedirectTarget({
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });
  if (rootTarget) {
    return NextResponse.redirect(
      new URL(rootTarget, request.url),
      ROOT_REDIRECT_STATUS,
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired — keeps cookies up to date
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
