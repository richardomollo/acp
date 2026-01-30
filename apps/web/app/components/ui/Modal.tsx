"use client";

import { useState } from "react";

type PopupProps = {
  open: boolean;
  onClose: () => void;
};

export default function Popup({ open, onClose }: PopupProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  if (!open) return null;

  function formatPhone(phone: string | null) {
    if (!phone) return undefined;
    let cleaned = phone.replace(/[\s()-]/g, "");
    if (cleaned.startsWith("0")) cleaned = "+254" + cleaned.slice(1);
    return cleaned;
  }

  function validatePhone(phone: string | null) {
    if (!phone) return true; // optional
    const formatted = formatPhone(phone);
    const regex = /^\+\d{9,15}$/;
    return regex.test(formatted || "");
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (!validatePhone(value)) {
      setPhoneError("Please enter a valid phone number (e.g., +254701234567)");
    } else {
      setPhoneError("");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setAlreadySubscribed(false);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name")?.toString() || "";
    const email = formData.get("email")?.toString() || "";
    const phone = formatPhone(formData.get("phone")?.toString() || "");

    if (!consent) {
      setError("Please give your consent to receive emails.");
      return;
    }

    if (phoneError) {
      setError("Please fix the phone number before submitting.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.message?.includes("already exists")) {
          setAlreadySubscribed(true);
        } else {
          throw new Error(data.error?.message || "Failed to subscribe");
        }
        return;
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to subscribe. Try again.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-m ">Join the waiting list</p>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black"
          >
            ✕
          </button>
        </div>

         <h3 className="md:text-4xl font-bold max-w-[850px] text-center mx-auto mt-8 mb-2">
       Sports and wellness, your way
    </h3>

     {success ? (
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Thank you! You’re officially on the waiting list! 🎉 🎉</h2>
            <p className="text-gray-600 mb-4">
              Thank you for joining us — we’ll notify you the moment our membership goes live. Get ready to enjoy over 50 sports, wellness experiences, and workouts anytime, anywhere. Stay tuned, and get ready to move, relax, and thrive!
            </p>
           
          </div>
        ) :  alreadySubscribed ?(
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">You’re already on the list! ✅</h2>
            <p className="text-gray-600 mb-4">
              Looks like you’ve already joined our waiting list. Hang tight, we’ll notify you when we launch!
            </p>
          </div>
        ) : (
        <>

    <p className="mt-3 text-m mb-4 text-gray-500/90 text-center">Join the most flexible sports and wellness membership in Nairobi. Get access to 50+ sports, wellness experiences, and workouts — anytime, anywhere, indoors or outdoors.</p>
    <p className="mt-3 text-m mb-4 text-gray-500/90 text-center">Sign up for the waiting list and get early access.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            placeholder="Full name"
            required
            className="w-full rounded-full border border-gray-200 px-4 py-2  h-12"
          />

          <input
            name="email"
            type="email"
            placeholder="Email address"
            required
            className="w-full rounded-full border border-gray-200 px-4 py-2  h-12"
          />

          <input
            name="phone"
            type="tel"
            placeholder="Phone number"
            className="w-full rounded-full border border-gray-200 px-4 py-2  h-12"
          />
           {phoneError && <p className="text-red-500 text-sm">{phoneError}</p>}

          <label className="flex items-center space-x-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="w-4 h-4"
                  required
                />
                <span>
                  I agree to receive emails about this service and understand
                  my data will be stored.
                </span>
              </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-black text-white px-6 py-3 rounded-full font-medium transition mb-4">
            {loading ? "Submitting..." : "Join waiting list"}
          </button>
        </form>
        </>
        )}
        {error && (
          <div>
            <div className="flex items-center justify-between  w-full bg-red-600/20 text-red-600 px-3 h-10 rounded">
              <div className="flex items-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 14.167q.354 0 .593-.24.24-.24.24-.594a.8.8 0 0 0-.24-.593.8.8 0 0 0-.594-.24.8.8 0 0 0-.593.24.8.8 0 0 0-.24.593q0 .354.24.594t.593.24m-.834-3.334h1.667v-5H9.166zm.833 7.5a8.1 8.1 0 0 1-3.25-.656 8.4 8.4 0 0 1-2.645-1.781 8.4 8.4 0 0 1-1.782-2.646A8.1 8.1 0 0 1 1.666 10q0-1.73.656-3.25a8.4 8.4 0 0 1 1.782-2.646 8.4 8.4 0 0 1 2.645-1.781A8.1 8.1 0 0 1 10 1.667q1.73 0 3.25.656a8.4 8.4 0 0 1 2.646 1.781 8.4 8.4 0 0 1 1.781 2.646 8.1 8.1 0 0 1 .657 3.25 8.1 8.1 0 0 1-.657 3.25 8.4 8.4 0 0 1-1.78 2.646 8.4 8.4 0 0 1-2.647 1.781 8.1 8.1 0 0 1-3.25.656" fill="currentColor"/>
                </svg>
                <p className="text-sm ml-2">{error}</p>
              </div>   
              <button type="button" aria-label="close" className="active:scale-90 transition-all ml-2 cursor-pointer text-red-500 hover:text-red-700">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 5 5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        )}
        </div>
    </div>
  );
}
function setSuccess(arg0: boolean) {
  throw new Error("Function not implemented.");
}

