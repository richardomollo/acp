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
        
        <span className="text-indigo-600">
          <Link 
            href={user ? "/sessions" : "/"} 
            className="text-2xl font-semibold text-gray-800"
          >
            FitPass
          </Link>
        </span>

        <ul className="md:flex hidden items-center gap-10">
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
              <button type="button" className="bg-white text-gray-600 border border-gray-300 md:inline hidden text-sm hover:bg-gray-50 active:scale-95 transition-all w-40 h-11 rounded-full">
                Get started for free!
              </button>
            </Link>
          )}
        </div>

        <button aria-label="menu-btn" type="button" className="menu-btn inline-block md:hidden active:scale-90 transition">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="#000">
            <path d="M 3 7 A 1.0001 1.0001 0 1 0 3 9 L 27 9 A 1.0001 1.0001 0 1 0 27 7 L 3 7 z M 3 14 A 1.0001 1.0001 0 1 0 3 16 L 27 16 A 1.0001 1.0001 0 1 0 27 14 L 3 14 z M 3 21 A 1.0001 1.0001 0 1 0 3 23 L 27 23 A 1.0001 1.0001 0 1 0 27 21 L 3 21 z"></path>
          </svg>
        </button>

        <div className="mobile-menu absolute top-[70px] left-0 w-full bg-white p-6 hidden md:hidden">
          <ul className="flex flex-col space-y-4 text-lg">
            <li><p className="text-sm">For You</p></li>
            <li><p className="text-sm">For Companies</p></li>
            <li><p className="text-sm">For Fitness Partners</p></li>
            {user && (
              <li>
                <Link href="/bookings" className="text-sm">
                  Check In
                </Link>
              </li>
            )}
          </ul>

          {user ? (
            <div className="mt-6 space-y-3">
              <Link href="/users/dashboard">
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
              <Link href="/partner-login">
                <button type="button" className="w-full text-sm text-gray-600 hover:text-gray-800 transition">
                  Partner Login
                </button>
              </Link>
              <Link href="/login">
                <button type="button" className="w-full bg-white text-gray-600 border border-gray-300 text-sm hover:bg-gray-50 active:scale-95 transition-all h-11 rounded-full">
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