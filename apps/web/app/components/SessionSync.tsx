"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

// Initialises the SSR-aware browser client on every page load.
// This migrates any existing localStorage-only Supabase session into
// cookies so that server components (e.g. PT dashboard layout) can
// read the session without forcing a re-login.
export default function SessionSync() {
  useEffect(() => {
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  return null;
}
