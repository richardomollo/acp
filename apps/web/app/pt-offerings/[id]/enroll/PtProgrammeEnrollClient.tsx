"use client";

import { useState, useRef } from "react";
import Link from "next/link";

type Offering = {
  id: string;
  title: string;
  programme_weeks: number;
  programme_price_kes: number;
  deposit_pct: number;
  instalment_frequency_weeks: number | null;
  pt_id: string;
};

type PT = {
  id: string;
  full_name: string;
  professional_name?: string | null;
  photo_url?: string | null;
};

function normalizeMpesa(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `254${digits}`;
  throw new Error("Enter a valid Safaricom M-Pesa number (07XX or 01XX).");
}

function fmtMoney(n: number) {
  return `KES ${Math.round(n).toLocaleString()}`;
}

export default function PtProgrammeEnrollClient({
  offering,
  pt,
  enrollmentId,
  offeringId,
}: {
  offering: Offering;
  pt: PT;
  enrollmentId: string;
  offeringId: string;
}) {
  const displayName = pt.professional_name ?? pt.full_name;
  const total = Number(offering.programme_price_kes);
  const depositPct = offering.deposit_pct ?? 30;
  const deposit = Math.round(total * depositPct / 100);
  const remaining = total - deposit;

  // Build instalment schedule
  const weeks = offering.programme_weeks;
  const freq = offering.instalment_frequency_weeks;
  const numInstalments = freq ? Math.floor(weeks / freq) : 0;
  const instalmentAmount = numInstalments > 0 ? Math.round(remaining / numInstalments) : remaining;
  const schedule: { label: string; amount: number }[] = [
    { label: "Deposit — due now", amount: deposit },
  ];
  for (let i = 1; i <= numInstalments; i++) {
    schedule.push({
      label: `Week ${i * freq!}`,
      amount: i === numInstalments ? remaining - instalmentAmount * (numInstalments - 1) : instalmentAmount,
    });
  }

  const [startDate, setStartDate] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [step, setStep] = useState<"confirm" | "processing" | "confirmed" | "failed">("confirm");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Min start date: tomorrow
  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  async function handlePay() {
    setError(null);
    if (!startDate) { setError("Please select a programme start date."); return; }

    let phone: string;
    try { phone = normalizeMpesa(mpesaPhone); }
    catch (e: any) { setError(e.message); return; }

    setStep("processing");

    try {
      const payRes = await fetch("/api/mpesa/programme-deposit-stk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, amount: deposit, enrollmentId, offeringId }),
      });
      const payData = await payRes.json();
      if (!payRes.ok) throw new Error(payData?.error ?? "Payment initiation failed.");

      const checkoutRequestId: string = payData.checkoutRequestId;
      if (!checkoutRequestId) throw new Error("No checkout request ID returned.");

      // Poll /api/mpesa/status until COMPLETED or FAILED
      const start = Date.now();
      const poll = async () => {
        if (Date.now() - start > 120_000) {
          await commitEnrollment("failed", null);
          setStep("failed");
          setError("Payment timed out. Please try again.");
          return;
        }
        pollRef.current = setTimeout(async () => {
          const res = await fetch(`/api/mpesa/status?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`);
          const data = await res.json();
          const s = String(data?.status ?? "").toUpperCase();
          if (s === "COMPLETED") {
            await commitEnrollment("paid", data?.mpesaReceipt ?? checkoutRequestId);
          } else if (["FAILED", "CANCELLED", "EXPIRED", "TIMEOUT"].includes(s)) {
            await commitEnrollment("failed", null);
            setStep("failed");
            setError(data?.reason || "Payment was not completed. Please try again.");
          } else {
            poll();
          }
        }, 5000);
      };
      poll();
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setStep("confirm");
    }
  }

  async function commitEnrollment(paymentStatus: "paid" | "failed", mpesaRef: string | null) {
    await fetch("/api/pt-programme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "commit",
        enrollment_id: enrollmentId,
        programme_start_date: startDate,
        total_price_kes: total,
        deposit_pct: depositPct,
        deposit_paid_kes: deposit,
        payment_method: "mpesa",
        payment_status: paymentStatus,
        mpesa_reference: mpesaRef,
      }),
    });
    if (paymentStatus === "paid") setStep("confirmed");
  }

  if (step === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin mb-6" />
        <p className="text-base font-semibold text-gray-900">Waiting for M-Pesa payment…</p>
        <p className="text-sm text-gray-500 mt-2 max-w-xs">Check your phone for an M-Pesa prompt and enter your PIN to complete.</p>
      </div>
    );
  }

  if (step === "confirmed") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5 mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">You're in!</h2>
        <p className="text-gray-500 text-sm mb-1">
          Your <strong>{offering.title}</strong> journey begins{" "}
          <strong>{new Date(startDate + "T00:00:00").toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}</strong>.
        </p>
        <p className="text-gray-400 text-xs mb-8">
          {displayName} will be in touch to schedule your sessions.
        </p>
        <div className="bg-gray-50 rounded-2xl p-5 text-left mb-8 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Payment schedule</p>
          {schedule.map((row, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className={i === 0 ? "font-medium text-gray-900" : "text-gray-500"}>{row.label}</span>
              <span className={i === 0 ? "font-bold text-gray-900" : "text-gray-500"}>{fmtMoney(row.amount)}</span>
            </div>
          ))}
        </div>
        <Link href={`/trainers/${pt.id}`} className="inline-block bg-black text-white text-sm font-semibold px-8 py-3 rounded-full hover:bg-gray-800 transition-colors">
          View trainer profile
        </Link>
      </div>
    );
  }

  if (step === "failed") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-5 mx-auto">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Failed</h2>
        <p className="text-sm text-gray-500 mb-6">{error}</p>
        <button
          onClick={() => { setStep("confirm"); setError(null); }}
          className="bg-black text-white text-sm font-semibold px-8 py-3 rounded-full hover:bg-gray-800 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Programme commitment</p>
        <h1 className="text-2xl font-bold text-gray-900">{offering.title}</h1>
        <p className="text-sm text-gray-500 mt-1">with {displayName} · {offering.programme_weeks} weeks</p>
      </div>

      {/* Price summary */}
      <div className="bg-gray-50 rounded-2xl p-5 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Payment schedule</p>
        <div className="space-y-2">
          {schedule.map((row, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className={i === 0 ? "font-medium text-gray-900" : "text-gray-500"}>{row.label}</span>
              <span className={i === 0 ? "text-lg font-bold text-gray-900" : "text-gray-600"}>{fmtMoney(row.amount)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 mt-4 pt-3 flex justify-between text-sm">
          <span className="text-gray-500">Total programme</span>
          <span className="font-bold text-gray-900">{fmtMoney(total)}</span>
        </div>
      </div>

      {/* Start date */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-gray-900 mb-2">Programme start date</label>
        <input
          type="date"
          value={startDate}
          min={minDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <p className="text-xs text-gray-400 mt-1.5">Sessions will be scheduled directly with {displayName} after this date.</p>
      </div>

      {/* M-Pesa */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-900 mb-2">M-Pesa number</label>
        <input
          type="tel"
          value={mpesaPhone}
          onChange={(e) => setMpesaPhone(e.target.value)}
          placeholder="07XX XXX XXX"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <p className="text-xs text-gray-400 mt-1.5">You'll receive an M-Pesa STK push for the deposit of {fmtMoney(deposit)}.</p>
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>
      )}

      <button
        onClick={handlePay}
        disabled={!startDate || !mpesaPhone}
        className="w-full py-3.5 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        Pay deposit {fmtMoney(deposit)} via M-Pesa
      </button>

      <p className="text-xs text-gray-400 text-center mt-4">
        By confirming, you agree to the payment schedule above. Remaining instalments are due every {freq ?? "few"} weeks.
      </p>
    </div>
  );
}
