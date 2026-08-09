"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const POLL_DELAYS = [4000, 4000, 5000, 5000, 10000, 15000, 15000];
const TIMEOUT_MS = 120_000;
const PAYBILL_NUMBER = "4322745";

function generatePaybillCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const el = document.createElement("textarea");
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
  return Promise.resolve();
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AuthUser = { id: string; email?: string | null };

function phoneForDisplay(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("254") && d.length === 12) return `0${d.slice(3)}`;
  return raw;
}

type DepositProps = {
  type: "session" | "experience";
  itemId: string;
  gymId: string;
  title: string;
  subtitle: string;
  detail?: string;
  venueName: string;
  spotsLeft: number;
  price: number;
  discountKes?: number;
  depositPct: number;
  depositAmount: number;
  remainderAmount: number;
  fullPayment?: boolean;
  backUrl: string;
  backLabel: string;
};

type PTProps = {
  type: "pt";
  itemId: string;
  ptId: string;
  ptName: string;
  title: string;
  offeringType: string;
  durationMinutes: number;
  priceKes: number | null;
  scheduledDate: string;
  scheduledTime: string;
  locationPref: string | null;
  clientAddress: string | null;
  programmeId: string | null;
  backUrl: string;
  backLabel: string;
};

type CheckoutClientProps = DepositProps | PTProps;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `254${digits}`;
  throw new Error("Phone must be a valid Safaricom M-Pesa number (e.g. 07XX XXX XXX).");
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-KE", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}


function nextDelay(index: number) {
  return POLL_DELAYS[Math.min(index, POLL_DELAYS.length - 1)];
}

// ── Small shared components ───────────────────────────────────────────────────

function HowItWorks({ depositPct, fullPayment }: { depositPct: number; fullPayment?: boolean }) {
  const steps = fullPayment
    ? [
        "Pay the full amount via M-Pesa to secure your spot.",
        "Approve the STK push prompt on your phone.",
        "Nothing more to pay at the venue — you're all set!",
      ]
    : [
        `Pay a ${depositPct}% deposit via M-Pesa to secure your spot.`,
        "Approve the STK push prompt on your phone.",
        "Pay the remainder at the venue on the day.",
      ];
  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-900 uppercase tracking-wide">How it works</p>
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-xs text-gray-600">
            <span className="w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SummaryRow({ icon, label }: { icon: string; label: string }) {
  if (!label) return null;
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <span className="text-sm text-gray-700">{label}</span>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const sz = small ? "w-5 h-5 border-[1.5px]" : "w-8 h-8 border-2";
  return <div className={`${sz} border-gray-200 border-t-gray-900 rounded-full animate-spin`} />;
}

// ── Deposit Flow (sessions + experiences) ─────────────────────────────────────

type DepositPaymentMethod = "mpesa" | "pesapal";
type DepositPhase = "idle" | "submitting" | "pending" | "success" | "failed" | "paybill";

function DepositFlow({
  p,
  user,
  checkingAuth,
  userPhone,
}: {
  p: DepositProps;
  user: AuthUser | null;
  checkingAuth: boolean;
  userPhone: string;
}) {
  const [phase, setPhase] = useState<DepositPhase>("idle");
  const [depositPayMethod, setDepositPayMethod] = useState<DepositPaymentMethod>("mpesa");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (userPhone) setPhone(phoneForDisplay(userPhone));
  }, [userPhone]);
  const [error, setError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [finalRemainder, setFinalRemainder] = useState(p.remainderAmount);
  const [mpesaReceipt, setMpesaReceipt] = useState<string | null>(null);

  // Paybill fallback state
  const [paybillStep, setPaybillStep] = useState<"instructions" | "receipt" | "confirming">("instructions");
  const [paybillCode, setPaybillCode] = useState("");
  const [paybillReceipt, setPaybillReceipt] = useState("");
  const [paybillError, setPaybillError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const pollIndexRef = useRef(0);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const pollMpesaStatus = useCallback((checkoutRequestId: string) => {
    stopPoll();
    const poll = async () => {
      if (Date.now() - startedAtRef.current > TIMEOUT_MS) {
        stopPoll();
        setError("Payment timed out. Please try again.");
        setPhase("failed");
        return;
      }
      try {
        const res = await fetch(
          `/api/mpesa/status?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        const st = String(data?.status ?? "").toUpperCase();
        if (st === "COMPLETED") {
          stopPoll();
          setMpesaReceipt(data?.mpesaReceipt ?? null);
          setConfirmCode(data?.confirmationCode ?? null);
          setFinalRemainder(data?.remainderAmount ?? p.remainderAmount);
          setPhase("success");
        } else if (st === "FAILED") {
          stopPoll();
          setError(data?.reason ?? "Payment was not completed. Please try again.");
          setPhase("failed");
        } else {
          pollRef.current = setTimeout(poll, nextDelay(pollIndexRef.current++));
        }
      } catch {
        pollRef.current = setTimeout(poll, nextDelay(pollIndexRef.current++));
      }
    };
    startedAtRef.current = Date.now();
    pollIndexRef.current = 0;
    void poll();
  }, [p.remainderAmount, stopPoll]);

  const openPaybill = () => {
    setPaybillCode(generatePaybillCode());
    setPaybillReceipt("");
    setPaybillError(null);
    setPaybillStep("instructions");
    setPhase("paybill");
  };

  const confirmPaybill = async () => {
    if (!paybillReceipt.trim() || !paybillCode) return;
    setPaybillStep("confirming");
    setPaybillError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) throw new Error("Please sign in to complete payment.");
      const body = p.type === "experience"
        ? { experienceId: p.itemId, confirmationCode: paybillCode, receipt: paybillReceipt.trim(), phone: phone || null }
        : { sessionId: p.itemId, confirmationCode: paybillCode, receipt: paybillReceipt.trim(), phone: phone || null };
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/book-paybill`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payment verification failed.");
      setConfirmCode(paybillCode);
      setFinalRemainder(data.remainderAmount ?? p.remainderAmount);
      setPhase("success");
    } catch (e: any) {
      setPaybillError(e.message ?? "Something went wrong.");
      setPaybillStep("receipt");
    }
  };

  const handleCopy = (text: string, key: string) => {
    copyText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  const handleSubmit = async () => {
    setError(null);

    if (!user && (!email.trim() || !email.includes("@"))) {
      setError("Please enter a valid email address.");
      return;
    }

    // ── PesaPal redirect flow ─────────────────────────────────────────────────
    if (depositPayMethod === "pesapal") {
      if (!phone.trim()) { setError("Please enter your WhatsApp number for booking updates."); return; }
      setPhase("submitting");
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const authToken = authSession?.access_token;
        const res = await fetch("/api/pesapal/submit-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            type: p.type,
            amount: p.depositAmount,
            description: `${p.type === "experience" ? "Experience" : "Session"} deposit: ${p.title}`,
            email: user?.email ?? email.trim(),
            phone: phone.trim() || undefined,
            firstName: name.trim() || undefined,
            metadata: {
              itemId: p.itemId,
              gymId: p.gymId,
              userId: user?.id ?? null,
              guestEmail: !user ? email.trim() : undefined,
              guestName: !user ? name.trim() : undefined,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || JSON.stringify(data) || "Payment initiation failed."); setPhase("idle"); return; }
        window.open(data.redirect_url ?? data.redirectUrl, "_blank");
      } catch (e: any) {
        setError(e.message ?? "Something went wrong.");
        setPhase("idle");
      }
      return;
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhone(phone.trim());
    } catch (e: any) {
      setError(e.message);
      return;
    }

    setPhase("submitting");

    if (!user) {
      const endpoint = p.type === "experience" ? "/api/guest-book-experience" : "/api/guest-book";
      const body =
        p.type === "experience"
          ? { experienceId: p.itemId, name: name.trim() || null, email: email.trim(), phone }
          : { sessionId: p.itemId, name: name.trim() || null, email: email.trim(), phone };
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Failed to create booking."); setPhase("idle"); return; }
        if (!data.checkoutRequestId) { setError("Failed to initiate payment."); setPhase("idle"); return; }
        setPhase("pending");
        pollMpesaStatus(data.checkoutRequestId);
      } catch (e: any) {
        setError(e.message ?? "Something went wrong.");
        setPhase("idle");
      }
      return;
    }

    // Authenticated
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;
    if (!token) { setError("Please log in again."); setPhase("idle"); return; }

    const authEndpoint = p.type === "experience" ? "/api/book-experience" : "/api/book-session";
    const authBody =
      p.type === "experience"
        ? { experienceId: p.itemId, phone: normalizedPhone }
        : { sessionId: p.itemId, phone: normalizedPhone };
    try {
      const res = await fetch(authEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(authBody),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Payment initiation failed."); setPhase("idle"); return; }
      if (!data.checkoutRequestId) { setError("Failed to initiate payment."); setPhase("idle"); return; }
      setPhase("pending");
      pollMpesaStatus(data.checkoutRequestId);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
      setPhase("idle");
    }
  };

  if (p.spotsLeft <= 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-gray-500 font-medium">No spots available</p>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-semibold text-green-800">Booking Confirmed!</p>
        </div>
        {confirmCode && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Check-in code</p>
            <p className="font-mono text-3xl font-bold tracking-widest text-black">{confirmCode}</p>
            {finalRemainder > 0 && (
              <p className="text-sm text-gray-500 border-t border-gray-100 pt-3">
                Bring <span className="font-semibold text-gray-800">KES {finalRemainder.toLocaleString()}</span> to pay the remainder at the venue.
              </p>
            )}
          </div>
        )}
        {mpesaReceipt && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-1">
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">M-Pesa receipt</p>
            <p className="font-mono text-sm font-bold text-gray-900">{mpesaReceipt}</p>
            {p.remainderAmount > 0 && (
              <p className="text-sm text-gray-500 mt-2 pt-2 border-t border-gray-100">
                Bring <span className="font-semibold text-gray-800">KES {p.remainderAmount.toLocaleString()}</span> to pay the remainder at the venue.
              </p>
            )}
          </div>
        )}
        <Link href={p.backUrl} className="block w-full text-center py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
          Back to details
        </Link>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
          <svg className="animate-spin h-5 w-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-blue-800">Check your phone</p>
            <p className="text-xs text-blue-600 mt-0.5">Approve the M-Pesa prompt to confirm your booking.</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center">This may take up to 2 minutes.</p>
      </div>
    );
  }

  if (phase === "paybill") {
    return (
      <div className="space-y-4">
        {paybillStep === "instructions" && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-green-800 uppercase tracking-wide">Pay via M-Pesa Paybill</p>
              <ol className="space-y-2 text-sm text-green-800">
                <li>1. Go to <strong>M-Pesa → Lipa na M-Pesa → Pay Bill</strong></li>
                <li>2. Enter Business No: <strong className="font-mono">{PAYBILL_NUMBER}</strong></li>
                <li>3. Enter Account No: <strong className="font-mono">{paybillCode}</strong></li>
                <li>4. Enter Amount: <strong>KES {p.depositAmount.toLocaleString()}</strong></li>
                <li>5. Enter your M-Pesa PIN and confirm</li>
              </ol>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
              {[
                { label: "Business No.", value: PAYBILL_NUMBER, key: "biz" },
                { label: "Account No.", value: paybillCode, key: "acc" },
                { label: "Amount (KES)", value: p.depositAmount.toLocaleString(), key: "amt" },
              ].map(({ label, value, key }) => (
                <div key={key} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-gray-500">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-gray-900">{value}</span>
                    {key !== "amt" && (
                      <button
                        onClick={() => handleCopy(value, key)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {copied === key ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPaybillStep("receipt")}
              className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition"
            >
              I've Paid — Enter Receipt →
            </button>
            <button
              onClick={() => setPhase("idle")}
              className="w-full py-2.5 text-sm rounded-xl border border-gray-200 hover:bg-gray-50 transition text-gray-500"
            >
              Cancel
            </button>
          </>
        )}
        {(paybillStep === "receipt" || paybillStep === "confirming") && (
          <>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">Account No. used</span>
              <span className="font-mono font-bold text-sm text-gray-900">{paybillCode}</span>
            </div>
            <input
              type="text"
              placeholder="M-Pesa confirmation code (e.g. QHK1KUZS2T)"
              value={paybillReceipt}
              onChange={e => setPaybillReceipt(e.target.value.toUpperCase())}
              disabled={paybillStep === "confirming"}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 font-mono tracking-wider"
            />
            {paybillError && <p className="text-xs text-red-600">{paybillError}</p>}
            <button
              onClick={confirmPaybill}
              disabled={paybillStep === "confirming" || !paybillReceipt.trim()}
              className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-50"
            >
              {paybillStep === "confirming" ? "Verifying…" : "Confirm Payment"}
            </button>
            <button
              onClick={() => setPaybillStep("instructions")}
              disabled={paybillStep === "confirming"}
              className="w-full py-2.5 text-sm rounded-xl border border-gray-200 hover:bg-gray-50 transition text-gray-500 disabled:opacity-40"
            >
              ← Back to instructions
            </button>
          </>
        )}
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="space-y-4">
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm font-semibold text-red-800">Payment Failed</p>
          {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
        </div>
        <button
          onClick={() => { setError(null); setPhase("idle"); }}
          className="w-full py-3 text-sm font-semibold rounded-xl border border-gray-300 hover:bg-gray-50 transition"
        >
          Try Again
        </button>
        {user && (
          <button
            onClick={openPaybill}
            className="w-full py-3 text-sm font-semibold rounded-xl border border-gray-900 text-gray-900 hover:bg-gray-50 transition"
          >
            Pay via M-Pesa Paybill instead
          </button>
        )}
      </div>
    );
  }

  const submitting = phase === "submitting";
  return (
    <div className="space-y-5">
      <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
        {p.discountKes ? (
          <>
            <div className="flex justify-between text-gray-400">
              <span>Original price</span>
              <span className="line-through">KES {p.price.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Platform discount</span>
              <span className="font-medium">-KES {p.discountKes.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600 border-t border-gray-200 pt-2">
              <span>Total</span>
              <span className="font-medium text-gray-900">KES {(p.price - p.discountKes).toLocaleString()}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between text-gray-600">
            <span>Total</span>
            <span className="font-medium text-gray-900">KES {p.price.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-600 border-t border-gray-200 pt-2">
          <span>{p.fullPayment ? "Pay in full" : `Deposit now (${p.depositPct}%)`}</span>
          <span className="font-bold text-gray-900">KES {p.depositAmount.toLocaleString()}</span>
        </div>
        {p.remainderAmount > 0 && (
          <div className="flex justify-between text-gray-400 text-xs">
            <span>At venue</span>
            <span>KES {p.remainderAmount.toLocaleString()}</span>
          </div>
        )}
      </div>

      <HowItWorks depositPct={p.depositPct} fullPayment={p.fullPayment} />

      {/* Payment method selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pay with</p>
        {[
          { id: "mpesa" as DepositPaymentMethod, label: "M-Pesa", sub: "STK push to your phone", icon: "📱" },
          { id: "pesapal" as DepositPaymentMethod, label: "Card / PesaPal", sub: "Visa, Mastercard & more", icon: "💳" },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setDepositPayMethod(opt.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${depositPayMethod === opt.id ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}
          >
            <span className="text-xl">{opt.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.sub}</p>
            </div>
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${depositPayMethod === opt.id ? "border-gray-900 bg-gray-900" : "border-gray-300"}`} />
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {!user && (
          <>
            <input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={submitting}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50"
            />
            <input
              type="email"
              placeholder="Email address *"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={submitting}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50"
            />
          </>
        )}
        <input
          type="tel"
          placeholder={depositPayMethod === "mpesa" ? "M-Pesa number (07XX XXX XXX)" : "WhatsApp number for booking updates"}
          value={phone}
          onChange={e => setPhone(e.target.value)}
          disabled={submitting}
          className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={submitting || checkingAuth}
          className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-50"
        >
          {submitting
            ? "Processing…"
            : depositPayMethod === "pesapal"
            ? `Pay KES ${p.depositAmount.toLocaleString()} with PesaPal →`
            : p.fullPayment
            ? `Pay KES ${p.depositAmount.toLocaleString()} in Full`
            : `Pay KES ${p.depositAmount.toLocaleString()} Deposit`}
        </button>
        {!user && !checkingAuth && (
          <p className="text-xs text-gray-400 text-center">
            Already have an account?{" "}
            <a
              href={`/login?redirect=${encodeURIComponent(`/checkout?type=${p.type}&id=${p.itemId}`)}`}
              className="underline hover:text-black"
            >
              Sign in
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

// ── PT Flow (payment only — date/time/location selected before checkout) ──────

type PTPhase = "idle" | "submitting" | "pending" | "success" | "failed" | "paybill";

function PTFlow({
  p,
  user,
  checkingAuth,
  userPhone,
}: {
  p: PTProps;
  user: AuthUser | null;
  checkingAuth: boolean;
  userPhone: string;
}) {
  const [phase, setPhase] = useState<PTPhase>("idle");
  const [payMethod, setPayMethod] = useState<"mpesa" | "pesapal">("mpesa");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (userPhone) setPhone(phoneForDisplay(userPhone));
  }, [userPhone]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mpesaReceipt, setMpesaReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Paybill fallback state
  const [paybillStep, setPaybillStep] = useState<"instructions" | "receipt" | "confirming">("instructions");
  const [paybillCode, setPaybillCode] = useState("");
  const [paybillReceipt, setPaybillReceipt] = useState("");
  const [paybillError, setPaybillError] = useState<string | null>(null);
  const [ptCopied, setPtCopied] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const pollIndexRef = useRef(0);
  const bookingIdRef = useRef<string | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => () => stopPoll(), [stopPoll]);

  const pollMpesaStatus = useCallback((checkoutRequestId: string) => {
    stopPoll();
    const poll = async () => {
      if (Date.now() - startedAtRef.current > TIMEOUT_MS) {
        stopPoll(); setError("Payment timed out. Please try again."); setPhase("failed"); return;
      }
      try {
        const res = await fetch(`/api/mpesa/status?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`, { cache: "no-store" });
        const data = await res.json();
        const st = String(data?.status ?? "").toUpperCase();
        if (st === "COMPLETED") {
          stopPoll();
          setMpesaReceipt(data?.mpesaReceipt ?? null);
          if (p.programmeId && bookingIdRef.current) {
            fetch("/api/pt-programme", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "link_intro", programme_id: p.programmeId, pt_id: p.ptId, intro_booking_id: bookingIdRef.current }),
            }).catch(() => {});
          }
          setPhase("success");
        }
        else if (st === "FAILED") { stopPoll(); setError(data?.reason ?? "Payment was not completed. Please try again."); setPhase("failed"); }
        else { pollRef.current = setTimeout(poll, nextDelay(pollIndexRef.current++)); }
      } catch { pollRef.current = setTimeout(poll, nextDelay(pollIndexRef.current++)); }
    };
    startedAtRef.current = Date.now(); pollIndexRef.current = 0; void poll();
  }, [stopPoll, p.programmeId, p.ptId]);

  const commonPayload = {
    pt_id: p.ptId,
    offering_id: p.itemId,
    scheduled_date: p.scheduledDate,
    scheduled_time: p.scheduledTime,
    location_type: p.locationPref || p.offeringType,
    client_address: p.clientAddress ?? null,
  };

  const openPtPaybill = () => {
    setPaybillCode(generatePaybillCode());
    setPaybillReceipt("");
    setPaybillError(null);
    setPaybillStep("instructions");
    setPhase("paybill");
  };

  const confirmPtPaybill = async () => {
    if (!paybillReceipt.trim() || !paybillCode) return;
    setPaybillStep("confirming");
    setPaybillError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) throw new Error("Please sign in to complete payment.");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/book-paybill`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ptOfferingId: p.itemId, ptId: p.ptId,
            ptDate: p.scheduledDate, ptTime: p.scheduledTime,
            locationType: p.locationPref || p.offeringType,
            clientAddress: p.clientAddress ?? null,
            confirmationCode: paybillCode, receipt: paybillReceipt.trim(),
            phone: phone || null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payment verification failed.");
      setMpesaReceipt(paybillReceipt.trim());
      setPhase("success");
    } catch (e: any) {
      setPaybillError(e.message ?? "Something went wrong.");
      setPaybillStep("receipt");
    }
  };

  const handlePtCopy = (text: string, key: string) => {
    copyText(text).then(() => { setPtCopied(key); setTimeout(() => setPtCopied(null), 2000); });
  };

  const handlePay = async () => {
    setError(null);

    if (!user && (!name.trim() || !email.trim() || !email.includes("@"))) {
      setError("Please enter your name and a valid email address.");
      return;
    }

    if (payMethod === "pesapal") {
      if (!phone.trim()) { setError("Please enter your WhatsApp number for booking updates."); return; }
      setPhase("submitting");
      try {
        const bookingRes = await fetch("/api/pt-booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...commonPayload,
            payment_method: "pesapal", amount_kes: p.priceKes,
            payment_status: "pending", status: "pending",
            guest_name: !user ? name.trim() : undefined,
            guest_email: !user ? email.trim() : undefined,
            guest_phone: !user ? phone.trim() || undefined : undefined,
          }),
        });
        const bookingJson = await bookingRes.json();
        if (!bookingRes.ok) throw new Error(bookingJson.error ?? "Booking failed.");

        const res = await fetch("/api/pesapal/submit-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "pt",
            amount: p.priceKes,
            description: `PT session: ${p.title} with ${p.ptName}`,
            email: user?.email ?? email.trim(),
            phone: phone.trim() || undefined,
            firstName: !user ? name.split(" ")[0] : undefined,
            lastName: !user ? name.split(" ").slice(1).join(" ") : undefined,
            metadata: {
              ptId: p.ptId, offeringId: p.itemId,
              scheduledDate: p.scheduledDate, scheduledTime: p.scheduledTime,
              locationType: p.locationPref || p.offeringType,
              clientAddress: p.clientAddress,
              userId: user?.id ?? null,
              guestName: !user ? name.trim() : null,
              guestEmail: !user ? email.trim() : null,
              guestPhone: !user ? phone.trim() : null,
              bookingId: bookingJson.booking.id,
              programmeId: p.programmeId ?? null,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          await fetch("/api/pt-booking", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bookingJson.booking.id, payment_status: "failed", status: "cancelled" }) });
          throw new Error(data.error || JSON.stringify(data) || "Payment initiation failed.");
        }
        window.open(data.redirect_url ?? data.redirectUrl, "_blank");
      } catch (e: any) { setError(e.message ?? "Something went wrong."); setPhase("idle"); }
      return;
    }

    // M-Pesa
    let normalizedPhone: string;
    try { normalizedPhone = normalizePhone(phone.trim()); }
    catch (e: any) { setError(e.message); return; }

    setPhase("submitting");
    try {
      const bookingRes = await fetch("/api/pt-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...commonPayload,
          payment_method: "mpesa", amount_kes: p.priceKes,
          payment_status: "pending", status: "pending",
          guest_name: !user ? name.trim() : undefined,
          guest_email: !user ? email.trim() : undefined,
          guest_phone: !user ? normalizedPhone : undefined,
        }),
      });
      const bookingJson = await bookingRes.json();
      if (!bookingRes.ok) throw new Error(bookingJson.error ?? "Booking failed.");

      bookingIdRef.current = bookingJson.booking.id as string;

      const stkRes = await fetch("/api/mpesa/pt-stk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ptBookingId: bookingJson.booking.id, phone: normalizedPhone }),
      });
      const stkData = await stkRes.json();
      if (!stkRes.ok) {
        await fetch("/api/pt-booking", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bookingJson.booking.id, payment_status: "failed", status: "cancelled" }) });
        throw new Error(stkData?.error ?? "Payment initiation failed.");
      }
      setPhase("pending");
      pollMpesaStatus(stkData.checkoutRequestId);
    } catch (e: any) { setError(e.message ?? "Something went wrong."); setPhase("idle"); }
  };

  // ── Success ────────────────────────────────────────────────────────────────

  if (phase === "success") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-semibold text-green-800">Booking Confirmed!</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <SummaryRow icon="📅" label={fmtDate(p.scheduledDate)} />
          <SummaryRow icon="🕐" label={fmtTime(p.scheduledTime)} />
          <SummaryRow icon="⏱" label={`${p.durationMinutes} min`} />
          {p.locationPref && <SummaryRow icon="📍" label={p.locationPref} />}
          {mpesaReceipt && (
            <>
              <div className="border-t border-gray-100 pt-3 mt-1">
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">M-Pesa receipt</p>
                <p className="font-mono text-sm font-bold text-gray-900">{mpesaReceipt}</p>
              </div>
            </>
          )}
        </div>
        <Link href={p.backUrl} className="block w-full text-center py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
          Done
        </Link>
      </div>
    );
  }

  // ── Pending ────────────────────────────────────────────────────────────────

  if (phase === "pending") {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
          <svg className="animate-spin h-5 w-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-blue-800">Check your phone</p>
            <p className="text-xs text-blue-600 mt-0.5">Approve the M-Pesa prompt to confirm your booking.</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center">This may take up to 2 minutes.</p>
      </div>
    );
  }

  // ── Paybill fallback ───────────────────────────────────────────────────────

  if (phase === "paybill") {
    const amount = Number(p.priceKes ?? 0);
    return (
      <div className="space-y-4">
        {paybillStep === "instructions" && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-green-800 uppercase tracking-wide">Pay via M-Pesa Paybill</p>
              <ol className="space-y-2 text-sm text-green-800">
                <li>1. Go to <strong>M-Pesa → Lipa na M-Pesa → Pay Bill</strong></li>
                <li>2. Enter Business No: <strong className="font-mono">{PAYBILL_NUMBER}</strong></li>
                <li>3. Enter Account No: <strong className="font-mono">{paybillCode}</strong></li>
                <li>4. Enter Amount: <strong>KES {amount.toLocaleString()}</strong></li>
                <li>5. Enter your M-Pesa PIN and confirm</li>
              </ol>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
              {[
                { label: "Business No.", value: PAYBILL_NUMBER, key: "biz" },
                { label: "Account No.", value: paybillCode, key: "acc" },
                { label: "Amount (KES)", value: amount.toLocaleString(), key: "amt" },
              ].map(({ label, value, key }) => (
                <div key={key} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-gray-500">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-gray-900">{value}</span>
                    {key !== "amt" && (
                      <button onClick={() => handlePtCopy(value, key)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        {ptCopied === key ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setPaybillStep("receipt")}
              className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition">
              I've Paid — Enter Receipt →
            </button>
            <button onClick={() => setPhase("idle")}
              className="w-full py-2.5 text-sm rounded-xl border border-gray-200 hover:bg-gray-50 transition text-gray-500">
              Cancel
            </button>
          </>
        )}
        {(paybillStep === "receipt" || paybillStep === "confirming") && (
          <>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">Account No. used</span>
              <span className="font-mono font-bold text-sm text-gray-900">{paybillCode}</span>
            </div>
            <input
              type="text"
              placeholder="M-Pesa confirmation code (e.g. QHK1KUZS2T)"
              value={paybillReceipt}
              onChange={e => setPaybillReceipt(e.target.value.toUpperCase())}
              disabled={paybillStep === "confirming"}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 font-mono tracking-wider"
            />
            {paybillError && <p className="text-xs text-red-600">{paybillError}</p>}
            <button
              onClick={confirmPtPaybill}
              disabled={paybillStep === "confirming" || !paybillReceipt.trim()}
              className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-50"
            >
              {paybillStep === "confirming" ? "Verifying…" : "Confirm Payment"}
            </button>
            <button onClick={() => setPaybillStep("instructions")} disabled={paybillStep === "confirming"}
              className="w-full py-2.5 text-sm rounded-xl border border-gray-200 hover:bg-gray-50 transition text-gray-500 disabled:opacity-40">
              ← Back to instructions
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Failed ─────────────────────────────────────────────────────────────────

  if (phase === "failed") {
    return (
      <div className="space-y-4">
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm font-semibold text-red-800">Payment Failed</p>
          {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
        </div>
        <button onClick={() => { setError(null); setPhase("idle"); }}
          className="w-full py-3 text-sm font-semibold rounded-xl border border-gray-300 hover:bg-gray-50 transition">
          Try Again
        </button>
        {user && (
          <button onClick={openPtPaybill}
            className="w-full py-3 text-sm font-semibold rounded-xl border border-gray-900 text-gray-900 hover:bg-gray-50 transition">
            Pay via M-Pesa Paybill instead
          </button>
        )}
      </div>
    );
  }

  // ── Idle / payment form ────────────────────────────────────────────────────

  const submitting = phase === "submitting";
  const canPay = (p.priceKes ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* Booking summary */}
      <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
        <SummaryRow icon="📅" label={fmtDate(p.scheduledDate)} />
        <SummaryRow icon="🕐" label={fmtTime(p.scheduledTime)} />
        <SummaryRow icon="⏱" label={`${p.durationMinutes} min · ${p.offeringType.replace(/-/g, " ")}`} />
        {p.locationPref && <SummaryRow icon="📍" label={p.locationPref} />}
        {p.clientAddress && <SummaryRow icon="🏠" label={p.clientAddress} />}
        {canPay && (
          <div className="flex justify-between border-t border-gray-200 pt-2 mt-1">
            <span className="text-gray-600">Total</span>
            <span className="font-bold text-gray-900">KES {Number(p.priceKes).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Guest contact fields */}
      {!user && (
        <div className="space-y-3">
          <input type="text" placeholder="Your name (optional)" value={name}
            onChange={e => setName(e.target.value)} disabled={submitting}
            className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50" />
          <input type="email" placeholder="Email address *" value={email}
            onChange={e => setEmail(e.target.value)} disabled={submitting}
            className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50" />
        </div>
      )}

      {canPay && (
        <>
          {/* Payment method selector */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pay with</p>
            {[
              { id: "mpesa" as const, label: "M-Pesa", sub: "STK push to your phone", icon: "📱" },
              { id: "pesapal" as const, label: "Card / PesaPal", sub: "Visa, Mastercard & more", icon: "💳" },
            ].map((opt) => (
              <button key={opt.id} onClick={() => setPayMethod(opt.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${payMethod === opt.id ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                <span className="text-xl">{opt.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.sub}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${payMethod === opt.id ? "border-gray-900 bg-gray-900" : "border-gray-300"}`} />
              </button>
            ))}
          </div>

          {/* Phone input — always required */}
          <input type="tel"
            placeholder={payMethod === "mpesa" ? "M-Pesa number (07XX XXX XXX)" : "WhatsApp number for booking updates"}
            value={phone} onChange={e => setPhone(e.target.value)} disabled={submitting}
            className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50" />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button onClick={handlePay} disabled={submitting || checkingAuth}
            className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-50">
            {submitting ? "Processing…"
              : payMethod === "pesapal"
              ? `Pay KES ${Number(p.priceKes).toLocaleString()} with PesaPal →`
              : `Pay KES ${Number(p.priceKes).toLocaleString()} with M-Pesa`}
          </button>
        </>
      )}

      {!canPay && (
        <p className="text-sm text-gray-400 text-center py-4">No payment option available. Contact the trainer directly.</p>
      )}

      {!user && !checkingAuth && (
        <p className="text-xs text-gray-400 text-center">
          Already have an account?{" "}
          <a href={`/login?redirect=${encodeURIComponent(`/checkout?type=pt&ptId=${p.ptId}&offeringId=${p.itemId}&date=${p.scheduledDate}&time=${p.scheduledTime}${p.locationPref ? `&location=${encodeURIComponent(p.locationPref)}` : ""}`)}`}
            className="underline hover:text-black">Sign in</a>
        </p>
      )}
    </div>
  );
}

// ── Page layout + auth gate ───────────────────────────────────────────────────

export default function CheckoutClient(props: CheckoutClientProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userPhone, setUserPhone] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user);
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("phone")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.phone) setUserPhone(profile.phone);
      }
      setCheckingAuth(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const isDeposit = props.type === "session" || props.type === "experience";

  return (
    <div className="min-h-[calc(100vh-70px)] bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-10">
        <Link
          href={props.backUrl}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-5 sm:mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {props.backLabel}
        </Link>

        <div className="flex flex-col lg:flex-row gap-5 lg:gap-8 items-start">
          {/* Left: Item summary */}
          <div className="w-full lg:flex-1 min-w-0">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 lg:sticky lg:top-[86px]">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">
                {props.type === "session" ? "Class" : props.type === "experience" ? "Experience" : "Personal Training"}
              </p>
              <h1 className="text-xl font-bold text-gray-900 mb-4">{props.title}</h1>

              {isDeposit && (
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{props.subtitle}</span>
                  </div>
                  {props.detail && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{props.detail}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span>{props.venueName}</span>
                  </div>
                  {props.spotsLeft > 0 && props.spotsLeft <= 5 && (
                    <p className="text-amber-600 font-medium text-xs mt-1">
                      Only {props.spotsLeft} spot{props.spotsLeft !== 1 ? "s" : ""} left!
                    </p>
                  )}
                </div>
              )}

              {props.type === "pt" && (
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>with {props.ptName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{props.durationMinutes} min · {props.offeringType.replace(/-/g, " ")}</span>
                  </div>
                  {props.priceKes && (
                    <p className="text-base font-bold text-gray-900 mt-2">
                      KES {Number(props.priceKes).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Checkout form */}
          <div className="w-full lg:w-[420px] flex-shrink-0">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <h2 className="text-base font-bold text-gray-900 mb-5">
                {props.type === "pt" ? "Book a session" : "Complete your booking"}
              </h2>

              {checkingAuth ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : props.type === "pt" ? (
                <PTFlow p={props} user={user} checkingAuth={checkingAuth} userPhone={userPhone} />
              ) : (
                <DepositFlow p={props} user={user} checkingAuth={checkingAuth} userPhone={userPhone} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
