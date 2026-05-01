"use client";

import { useState } from "react";
import Link from "next/link";

export default function PartnerHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="w-full bg-white border-b border-gray-100 sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-6 md:px-16 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="#" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xl font-bold text-gray-900 tracking-tight">
            Active <span className="text-black-600">CityPass</span>
          </span>
          <span className="hidden sm:inline-block text-xs font-medium text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 ml-1">
            for Partners
          </span>
        </Link>

        {/* Desktop nav */}
        <ul className="hidden md:flex items-center gap-8 text-sm text-gray-600">
          <li>
            <a href="/partners/signup#how-it-works" className="hover:text-gray-900 transition">How it works</a>
          </li>
          <li>
            <a href="/partners/signup#benefits" className="hover:text-gray-900 transition">Benefits</a>
          </li>
          <li>
            <a href="/partners/signup#faq" className="hover:text-gray-900 transition">FAQ</a>
          </li>
        </ul>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/partner-login"
            className="text-sm text-gray-600 hover:text-gray-900 transition font-medium"
          >
            Sign in
          </Link>
          <Link
            href="/partner-signup"
            className="bg-[#000] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-indigo-900 transition"
          >
            Become a Partner
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-gray-600 hover:text-gray-900 transition"
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

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3 text-sm text-gray-700">
          <a href="#how-it-works" className="block py-1 hover:text-gray-900" onClick={() => setMobileOpen(false)}>How it works</a>
          <a href="#benefits" className="block py-1 hover:text-gray-900" onClick={() => setMobileOpen(false)}>Benefits</a>
          <a href="#faq" className="block py-1 hover:text-gray-900" onClick={() => setMobileOpen(false)}>FAQ</a>
          <Link href="/" className="block py-1 hover:text-gray-900" onClick={() => setMobileOpen(false)}>For Members</Link>
          <div className="pt-3 flex flex-col gap-2">
            <Link href="/partner-login"
              className="text-center border border-gray-200 rounded-full py-2.5 font-medium hover:bg-gray-50 transition"
              onClick={() => setMobileOpen(false)}>
              Sign in
            </Link>
            <Link href="/partner-signup"
              className="text-center bg-[#050040] text-white rounded-full py-2.5 font-semibold hover:bg-indigo-900 transition"
              onClick={() => setMobileOpen(false)}>
              Become a Partner
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
