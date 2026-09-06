"use client";

// LANA PRO — Phase 4.6: "Working as …" context switcher.
//
// Navigation/state ONLY — never an authorization boundary. Picking a context
// sets a cookie and refreshes; the server re-resolves identity and authorises
// every resource independently for the selected context.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WorkspaceContextOption } from "@/lib/lana-pro-workspace/contexts";

const COOKIE = "lana_pro_ctx";

export function ContextSwitcher({
  contexts,
  activeId,
}: {
  contexts: WorkspaceContextOption[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(activeId ?? contexts[0]?.id ?? "");

  // A single context is not a choice — don't add UI noise.
  if (contexts.length < 2) return null;

  const onChange = (next: string) => {
    setValue(next);
    document.cookie = `${COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      // Land on Home so we never sit on a section the new context can't see.
      router.push("/lana-pro/home");
      router.refresh();
    });
  };

  return (
    <div className="mt-4">
      <label
        htmlFor="lana-pro-context"
        className="block text-[10px] font-bold text-white/40 uppercase tracking-[0.16em] mb-1"
      >
        Working as
      </label>
      <div className="relative">
        <select
          id="lana-pro-context"
          value={value}
          disabled={pending}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg bg-white/10 text-white text-sm font-medium pl-3 pr-8 py-2 border border-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
        >
          {contexts.map((c) => (
            <option key={c.id} value={c.id} className="text-gray-900">
              {c.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
