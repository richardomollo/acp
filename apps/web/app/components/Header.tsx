"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORY_LINKS = [
  { label: "Explore", href: "/sessions" },
  { label: "Gyms and Studios", href: "/venues" },
  { label: "Classes and Sessions", href: "/classes" },
  { label: "Wellness Experiences", href: "/experiences" },
  { label: "Trainers, Coaches and Nutritionists", href: "/trainers" },
];

export default function Header() {
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  return (
    <header className="sticky top-0 z-10000 bg-white flex-shrink-0 border-b border-gray-100">

      {/* Top announcement strip */}
      <div className="bg-black text-white text-xs font-medium px-6 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span className="text-white/70">Are you a gym, personal trainer, coach, studio, wellness venue or fitness experiences provider?</span>
        <Link
          href="/partners/signup"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 underline underline-offset-2 font-semibold text-white hover:text-white/80 transition-colors"
        >
          Become a Partner →
        </Link>
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <nav className="h-16 flex items-center justify-between">

          {/* Logo */}
          <Link href={user ? "/sessions" : "/"} className="flex-shrink-0">
            <img src="/images/logo.png" alt="Active CityPass" className="h-8 w-auto" />
          </Link>

          {/* Desktop right: Bookings + auth */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/bookings"
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors rounded-md hover:bg-gray-50"
            >
              Bookings
            </Link>
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 rounded-full hover:bg-gray-50"
                >
                  <span className="truncate max-w-[160px]">{user.email}</span>
                  <svg
                    className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50">
                    <Link
                      href="/users/dashboard"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Profile
                    </Link>
                    <div className="mx-3 border-t border-gray-100 my-1" />
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut();
                        window.location.href = "/";
                      }}
                      className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors px-4 py-2"
                >
                  Log in
                </Link>
                <Link
                  href="/login?view=signup"
                  className="px-5 py-2 text-sm font-semibold bg-black text-white hover:text-black rounded-full hover:bg-gray-100 transition-colors"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            aria-label="Toggle menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            {mobileMenuOpen ? (
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

      {/* Category sub-nav */}
      <div className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center overflow-x-auto scrollbar-none gap-0">
            {CATEGORY_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="flex-shrink-0 py-2.5 px-4 text-xs font-semibold text-gray-500 hover:text-gray-900 whitespace-nowrap transition-colors border-b-2 border-transparent hover:border-gray-900"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex flex-col gap-1 mb-4">
              <Link
                href="/bookings"
                className="py-2.5 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Bookings
              </Link>
              {CATEGORY_LINKS.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="py-2.5 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
            </div>

            {user ? (
              <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                <Link
                  href="/users/dashboard"
                  className="py-2.5 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Profile
                </Link>
                <p className="text-sm text-gray-400 py-1 truncate">{user.email}</p>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/";
                  }}
                  className="w-full bg-black text-white text-sm font-semibold h-11 rounded-full hover:bg-gray-800 transition-colors"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <button className="w-full border border-gray-300 text-gray-900 text-sm font-semibold h-11 rounded-full hover:bg-gray-50 transition-colors">
                    Log in
                  </button>
                </Link>
                <Link href="/login?view=signup" onClick={() => setMobileMenuOpen(false)}>
                  <button className="w-full bg-black text-white text-sm font-semibold h-11 rounded-full hover:bg-gray-800 transition-colors">
                    Sign up
                  </button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
