"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Props = {
  type: "session" | "experience";
  itemId: string;
  price: number;
  label: string;
  className: string;
};

export default function BookButton({ type, itemId, price, label, className }: Props) {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setLoggedIn(!!user);
      setCheckingAuth(false);
    });
  }, []);

  const checkoutHref = `/checkout?type=${type}&id=${itemId}`;

  if (price > 0) {
    return (
      <Link href={checkoutHref} className={className}>
        {label}
      </Link>
    );
  }

  if (confirmCode) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm">
        <p className="font-semibold text-green-800 mb-1">✓ Booking confirmed!</p>
        <p className="text-green-700">Check-in code: <span className="font-mono font-bold">{confirmCode}</span></p>
      </div>
    );
  }

  const bookAuthenticated = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) { setError("Please log in again."); setSubmitting(false); return; }
      const endpoint = type === "experience" ? "/api/book-experience" : "/api/book-session";
      const body = type === "experience" ? { experienceId: itemId } : { sessionId: itemId };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking failed.");
      setConfirmCode(data.confirmationCode ?? null);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const bookAsGuest = async () => {
    if (!email.trim() || !email.includes("@")) { setError("Please enter a valid email address."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = type === "experience" ? "/api/guest-book-experience" : "/api/guest-book";
      const body = type === "experience"
        ? { experienceId: itemId, name: name.trim() || null, email: email.trim() }
        : { sessionId: itemId, name: name.trim() || null, email: email.trim() };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking failed.");
      setConfirmCode(data.confirmationCode ?? null);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (showGuestForm) {
    return (
      <div className="space-y-2.5">
        <input
          type="text"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={bookAsGuest}
          disabled={submitting}
          className={className}
        >
          {submitting ? "Booking…" : "Confirm Free Booking"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => (checkingAuth ? undefined : loggedIn ? bookAuthenticated() : setShowGuestForm(true))}
        disabled={submitting || checkingAuth}
        className={className}
      >
        {submitting ? "Booking…" : "Book Free"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
