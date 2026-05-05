// components/Header.tsx
"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Popup from "./ui/Modal";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Header() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Check auth status
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="w-full border-b border-gray-200">
      <nav className="h-[70px] relative w-full px-6 md:px-16 lg:px-24 xl:px-32 flex items-center justify-between z-20 bg-white text-gray-700 shadow-[0px_4px_25px_0px_#0000000D] transition-all">
        
        <Link href={user ? "/sessions" : "/"}>
          <img src="/images/logo.png" alt="Active CityPass" className="h-12 w-auto" />
        </Link>

        <ul className="md:flex hidden items-center gap-10 text-sm">
          <li><Link className="hover:text-gray-500/80 transition" href="/sessions">Find Classes and Appointments</Link></li>
          <li><Link className="hover:text-gray-500/80 transition" href="/venues">Discover Venues</Link></li>
          
          {user && (
            <li>
              <Link className="hover:text-gray-500/80 transition" href="/bookings">
                Check In
              </Link>
            </li>
          )}
        </ul>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="hidden md:flex items-center gap-3">
              <Link href="/users/dashboard">
                <span className="text-sm text-gray-600 hover:text-gray-800 cursor-pointer transition underline">
                  {user.email}
                </span>
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = '/';
                }}
                className="text-sm text-gray-600 hover:text-gray-800 transition"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login">
              <button type="button" className="bg-black text-white md:inline hidden text-sm hover:bg-gray-900 active:scale-95 transition-all w-40 h-11 rounded-full">
                Get started for free!
              </button>
            </Link>
          )}
        </div>

        <button 
          aria-label="menu-btn" 
          type="button" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="menu-btn inline-block md:hidden active:scale-90 transition"
        >
          {mobileMenuOpen ? (
            // Close icon
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="#000">
              <path d="M 7 4 C 6.744125 4 6.4879687 4.0974687 6.2929688 4.2929688 L 4.2929688 6.2929688 C 3.9019687 6.6839688 3.9019687 7.3170313 4.2929688 7.7070312 L 11.585938 15 L 4.2929688 22.292969 C 3.9019687 22.683969 3.9019687 23.317031 4.2929688 23.707031 L 6.2929688 25.707031 C 6.6839688 26.098031 7.3170313 26.098031 7.7070312 25.707031 L 15 18.414062 L 22.292969 25.707031 C 22.682969 26.098031 23.317031 26.098031 23.707031 25.707031 L 25.707031 23.707031 C 26.098031 23.316031 26.098031 22.682969 25.707031 22.292969 L 18.414062 15 L 25.707031 7.7070312 C 26.098031 7.3170312 26.098031 6.6829688 25.707031 6.2929688 L 23.707031 4.2929688 C 23.316031 3.9019687 22.682969 3.9019687 22.292969 4.2929688 L 15 11.585938 L 7.7070312 4.2929688 C 7.5115312 4.0974687 7.255875 4 7 4 z"></path>
            </svg>
          ) : (
            // Hamburger icon
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="#000">
              <path d="M 3 7 A 1.0001 1.0001 0 1 0 3 9 L 27 9 A 1.0001 1.0001 0 1 0 27 7 L 3 7 z M 3 14 A 1.0001 1.0001 0 1 0 3 16 L 27 16 A 1.0001 1.0001 0 1 0 27 14 L 3 14 z M 3 21 A 1.0001 1.0001 0 1 0 3 23 L 27 23 A 1.0001 1.0001 0 1 0 27 21 L 3 21 z"></path>
            </svg>
          )}
        </button>

        {/* Mobile Menu */}
        <div className={`mobile-menu absolute top-[70px] left-0 w-full bg-white p-6 md:hidden shadow-lg transition-all duration-300 ${
          mobileMenuOpen ? 'block' : 'hidden'
        }`}>
          <ul className="flex flex-col space-y-4 text-lg">
            <li>
              <Link href="/sessions" className="text-sm block" onClick={() => setMobileMenuOpen(false)}>
                Find Classes and Appointments
              </Link>
            </li>
            <li>
              <Link href="/venues" className="text-sm block" onClick={() => setMobileMenuOpen(false)}>
                Discover Venues
              </Link>
            </li>
            {user && (
              <li>
                <Link href="/bookings" className="text-sm block" onClick={() => setMobileMenuOpen(false)}>
                  Check In
                </Link>
              </li>
            )}
          </ul>

          {user ? (
            <div className="mt-6 space-y-3">
              <Link href="/users/dashboard" onClick={() => setMobileMenuOpen(false)}>
                <button className="w-full text-left text-sm text-gray-600 hover:text-gray-800 transition underline">
                  {user.email}
                </button>
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = '/';
                }}
                className="w-full bg-white text-gray-600 border border-gray-300 text-sm hover:bg-gray-50 active:scale-95 transition-all h-11 rounded-full"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                <button type="button" className="w-full bg-black text-white text-sm hover:bg-gray-700 active:scale-95 transition-all h-11 rounded-full">
                  Get started
                </button>
              </Link>
            </div>
          )}
        </div>
      </nav>
      <Popup open={open} onClose={() => setOpen(false)} />
    </header>
  );
}