"use client";

import { useState } from "react";
import Link from "next/link";
import AppStoreBadge from "./AppStoreBadge";

const PARTNER_APP_STORE_URL = "https://apps.apple.com/nl/app/active-urban-pass-partners/id6760468404?l=en-GB";

const NAV_LINKS = [
  { label: "How it works", href: "/partners/signup#how-it-works" },
  { label: "Benefits", href: "/partners/signup#benefits" },
  { label: "FAQ", href: "/partners/signup#faq" },
];

export default function PartnerHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-black">
      <div className="max-w-7xl mx-auto px-6">
        <nav className="h-16 flex items-center justify-between">

          {/* Logo + badge */}
          <Link href="/partners/signup" className="flex items-center gap-2 flex-shrink-0">
            <img src="/images/logo-white.png" alt="Active CityPass" className="h-8 w-auto" />
            <span className="hidden sm:inline-block text-xs font-medium text-white/40 border border-white/20 rounded px-1.5 py-0.5">
              for Partners
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors rounded-md hover:bg-white/10"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2">
            <a
              href={PARTNER_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/70 hover:text-white transition-colors px-4 py-2"
            >
              Get the App
            </a>
            <Link
              href="/partner-login"
              className="text-sm text-white/70 hover:text-white transition-colors px-4 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/partner-signup"
              className="px-5 py-2 text-sm font-semibold bg-white text-black rounded-full hover:bg-gray-100 transition-colors"
            >
              Become a Partner
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-white/70 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </nav>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-black border-t border-white/10 px-6 py-4">
          <div className="flex flex-col gap-1 mb-4">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="py-2.5 text-sm text-white/70 hover:text-white transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/"
              className="py-2.5 text-sm text-white/70 hover:text-white transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              For Members
            </Link>
          </div>
          <div className="flex flex-col gap-2 pt-3 border-t border-white/10">
            <div className="flex justify-center pb-1">
              <AppStoreBadge href={PARTNER_APP_STORE_URL} variant="light" />
            </div>
            <Link href="/partner-login" onClick={() => setMobileOpen(false)}>
              <button className="w-full border border-white/30 text-white text-sm font-semibold h-11 rounded-full hover:bg-white/10 transition-colors">
                Sign in
              </button>
            </Link>
            <Link href="/partner-signup" onClick={() => setMobileOpen(false)}>
              <button className="w-full bg-white text-black text-sm font-semibold h-11 rounded-full hover:bg-gray-100 transition-colors">
                Become a Partner
              </button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
