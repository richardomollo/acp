"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * LANA PRO onboarding — the responsive SaaS frame.
 *
 * Desktop-first: a fixed top bar (brand · Help · Sign out), a thin progress
 * strip, then a centred content column that becomes a two-column layout on
 * `lg` and up — LEFT is the form/decision, RIGHT is contextual explanation /
 * preview / progress. Below `lg` the right column drops beneath the form.
 * Not a stretched mobile card: generous max-width, real whitespace, one
 * clear hierarchy per screen.
 */
export function OnboardingShell({
  progress,
  onBack,
  canGoBack,
  onSignOut,
  left,
  right,
}: {
  /** 0..1 */
  progress: number;
  onBack?: () => void;
  canGoBack?: boolean;
  onSignOut?: () => void;
  left: ReactNode;
  /** contextual panel — omit for full-width steps (e.g. the welcome hero) */
  right?: ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col text-[#111]"
      // Same top-fade as the mobile app's entry screens: brand blue easing to
      // white over the first 460px (palette.blue100 → transparent).
      style={{
        background:
          "linear-gradient(180deg, #d0e0ff 0%, rgba(208,224,255,0) 460px), #ffffff",
      }}
    >
      {/* Top bar */}
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/lana-wordmark.png" alt="Lana" className="h-6 w-auto" />
            <span className="text-[11px] font-bold text-[#050040]/50 uppercase tracking-[0.16em]">
              Pro
            </span>
          </div>
          <div className="flex items-center gap-5 text-sm">
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="text-gray-500 hover:text-gray-800 transition"
              >
                Sign out
              </button>
            ) : (
              <Link href="/partner-login" className="text-gray-500 hover:text-gray-800 transition">
                Log in
              </Link>
            )}
          </div>
        </div>
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-[#050040] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 sm:py-16">
          {canGoBack && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-8 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] rounded"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}

          {right ? (
            <div className="grid gap-10 lg:gap-16 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
              <div className="min-w-0">{left}</div>
              <aside className="lg:sticky lg:top-24 order-last">
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-6 sm:p-7">{right}</div>
              </aside>
            </div>
          ) : (
            <div className="max-w-2xl">{left}</div>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-100">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-5 text-xs text-gray-400">
          By continuing you agree to Lana&apos;s Terms of Service and Privacy Policy.
        </div>
      </footer>
    </div>
  );
}

// ── Small shared primitives so every step reads consistently ─────────────

export function StepHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.16em] mb-3">{eyebrow}</p>
      )}
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-[1.15] tracking-tight">{title}</h1>
      {subtitle && <p className="text-gray-500 mt-3 text-[15px] leading-relaxed">{subtitle}</p>}
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center bg-[#050040] text-white text-sm font-semibold px-7 py-3 rounded-full hover:bg-indigo-900 transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
    >
      {children}
    </button>
  );
}

export const fieldClass =
  "w-full px-4 py-3 border border-gray-200 rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#050040]/25 focus:border-[#050040] transition";

export const fieldErrorClass =
  "w-full px-4 py-3 border border-red-300 rounded-xl text-[15px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition";
