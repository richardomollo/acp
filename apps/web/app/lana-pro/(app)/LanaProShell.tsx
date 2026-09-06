"use client";

// LANA PRO — Phase 4.1: the reusable workspace shell.
//
// ONE shell for every provider type. The nav is passed in already resolved by
// the pure capability model (lib/lana-pro-workspace/capabilities.ts) — this
// component never decides what a provider can see.

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import type { NavItemId } from "@/lib/lana-pro-workspace/capabilities";
import type { WorkspaceContextOption } from "@/lib/lana-pro-workspace/contexts";
import { ContextSwitcher } from "./ContextSwitcher";

export interface ShellNavItem {
  id: NavItemId;
  label: string;
  href: string;
}

const ICONS: Record<NavItemId, React.ReactNode> = {
  home: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  ),
  clients: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 5v-2a4 4 0 00-3-3.87m-9.6 0A4 4 0 006 15.13V17" />
  ),
  bookings: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  ),
  services: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  ),
  schedule: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  team: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  ),
  business: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m2-14h4m-4 4h4m-4 4h4m6-8h2m-2 4h2m-2 4h2" />
  ),
  profile: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  ),
};

function NavIcon({ id }: { id: NavItemId }) {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[id]}
    </svg>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "L"
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return href === "/lana-pro/home" ? pathname === href : pathname.startsWith(href);
}

function Brand({
  displayName,
  roleLabel,
  contexts,
  activeContextId,
}: {
  displayName: string;
  roleLabel: string;
  contexts: WorkspaceContextOption[];
  activeContextId: string | null;
}) {
  return (
    <div className="px-5 pt-7 pb-5 border-b border-white/10">
      <div className="flex items-center gap-2 mb-4">
        {/* dark-on-transparent wordmark, flipped to solid white for the sidebar */}
        <img src="/images/lana-wordmark.png" alt="Lana" className="h-5 w-auto brightness-0 invert opacity-90" />
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.18em]">Pro</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold text-white">
          {initialsOf(displayName)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{displayName}</p>
          <p className="text-xs text-white/45 truncate">{roleLabel}</p>
        </div>
      </div>
      <ContextSwitcher contexts={contexts} activeId={activeContextId} />
    </div>
  );
}

function NavList({
  nav,
  pathname,
  onNavigate,
}: {
  nav: ShellNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Lana Pro sections" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {nav.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              active ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <NavIcon id={item.id} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ShellFooter({
  signingOut,
  onSignOut,
  onNavigate,
}: {
  signingOut: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="px-3 py-4 border-t border-white/10 space-y-1">
      <button
        onClick={onSignOut}
        disabled={signingOut}
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

export function LanaProShell({
  nav,
  displayName,
  roleLabel,
  contexts,
  activeContextId,
  children,
}: {
  nav: ShellNavItem[];
  displayName: string;
  roleLabel: string;
  contexts: WorkspaceContextOption[];
  activeContextId: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    router.push("/partner-login");
    router.refresh();
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-64 bg-[#050040] flex-shrink-0">
        <Brand displayName={displayName} roleLabel={roleLabel} contexts={contexts} activeContextId={activeContextId} />
        <NavList nav={nav} pathname={pathname} />
        <ShellFooter signingOut={signingOut} onSignOut={signOut} />
      </aside>

      <div
        className="flex flex-col flex-1 min-w-0"
        // Same top-fade as the mobile app's entry screens: brand blue easing to
        // the app surface over the first 460px. Sits on the non-scrolling
        // wrapper so it stays put while the content column scrolls over it.
        style={{
          background:
            "linear-gradient(180deg, #d0e0ff 0%, rgba(208,224,255,0) 460px), #f9fafb",
        }}
      >
        {/* ── Mobile top bar ── */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#050040] text-white flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold">
              {initialsOf(displayName)}
            </div>
            <span className="text-sm font-semibold truncate">{displayName}</span>
          </div>
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            aria-controls="lana-pro-mobile-nav"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {drawerOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </header>

        {drawerOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div className="fixed inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
            <div id="lana-pro-mobile-nav" className="relative z-50 flex flex-col w-72 max-w-[85%] bg-[#050040] h-full">
              <Brand displayName={displayName} roleLabel={roleLabel} contexts={contexts} activeContextId={activeContextId} />
              <NavList nav={nav} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
              <ShellFooter
                signingOut={signingOut}
                onSignOut={signOut}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
