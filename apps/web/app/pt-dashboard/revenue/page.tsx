"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Booking = {
  id: string;
  scheduled_date: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
  amount_kes: number | null;
  users: { full_name: string } | null;
  pt_offerings: { title: string } | null;
};

type PayoutRequest = {
  id: string;
  amount: number;
  method: "mpesa" | "bank";
  phone: string | null;
  business_number: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  destination_type: "MPESA_NUMBER" | "MPESA_PAYBILL" | "BANK" | null;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
};

const PLATFORM_FEE = 0.15;

function calcEarning(b: Booking): number {
  const gross = b.amount_kes ?? 0;
  return gross * (1 - PLATFORM_FEE);
}

export default function RevenuePage() {
  const router = useRouter();
  const [ptId, setPtId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  // Payout form state
  const [payoutMethod, setPayoutMethod] = useState<"mpesa" | "paybill" | "bank">("mpesa");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/partner-login");
      return;
    }

    const { data: pt } = await supabase
      .from("personal_trainers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pt) {
      router.push("/partner-login");
      return;
    }

    setPtId(pt.id);

    const [{ data: bookingsData }, { data: payoutsData }] = await Promise.all([
      supabase
        .from("pt_bookings")
        .select(
          "id, scheduled_date, status, amount_kes, users(full_name), pt_offerings(title)"
        )
        .eq("pt_id", pt.id)
        .order("scheduled_date", { ascending: false }),
      supabase
        .from("pt_payout_requests")
        .select("*")
        .eq("pt_id", pt.id)
        .order("created_at", { ascending: false }),
    ]);

    setBookings((bookingsData as unknown as Booking[]) ?? []);
    setPayouts((payoutsData as unknown as PayoutRequest[]) ?? []);
    setLoading(false);
  }

  // ── Derived stats ────────────────────────────────────────────────────────────

  const completedBookings = bookings.filter((b) => b.status === "completed");
  const totalEarned = completedBookings.reduce((sum, b) => sum + calcEarning(b), 0);

  const thisMonthEarnings = completedBookings
    .filter((b) => b.scheduled_date >= monthStart)
    .reduce((sum, b) => sum + calcEarning(b), 0);

  const upcomingEarnings = bookings
    .filter(
      (b) =>
        (b.status === "confirmed" || b.status === "pending") &&
        b.scheduled_date >= today.toISOString().slice(0, 10)
    )
    .reduce((sum, b) => sum + calcEarning(b), 0);

  const noShowCount = bookings.filter((b) => b.status === "no_show").length;

  const totalPaidOut = payouts
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingPayouts = payouts
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((sum, p) => sum + p.amount, 0);

  const availableBalance = Math.max(0, totalEarned - totalPaidOut - pendingPayouts);

  // ── Payout submit ────────────────────────────────────────────────────────────

  async function handlePayoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ptId) return;
    setPayoutLoading(true);
    setPayoutError("");
    setPayoutSuccess(false);

    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) {
      setPayoutError("Please enter a valid amount.");
      setPayoutLoading(false);
      return;
    }
    if (amount > availableBalance) {
      setPayoutError(`Amount exceeds available balance of KES ${availableBalance.toLocaleString("en-KE", { maximumFractionDigits: 0 })}.`);
      setPayoutLoading(false);
      return;
    }

    const destinationType =
      payoutMethod === "mpesa" ? "MPESA_NUMBER" : payoutMethod === "paybill" ? "MPESA_PAYBILL" : "BANK";

    const body: Record<string, any> = {
      type: "pt",
      ptId,
      amount,
      destinationType,
    };

    if (payoutMethod === "mpesa") {
      if (!phone.trim()) {
        setPayoutError("Please enter your M-Pesa phone number.");
        setPayoutLoading(false);
        return;
      }
      body.phone = phone.trim().replace(/\s/g, "").replace(/^0/, "254").replace(/^\+/, "");
    } else if (payoutMethod === "paybill") {
      if (!businessNumber.trim() || !accountNumber.trim()) {
        setPayoutError("Please enter the Paybill business number and account number.");
        setPayoutLoading(false);
        return;
      }
      body.businessNumber = businessNumber.trim();
      body.accountNumber = accountNumber.trim();
    } else {
      if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
        setPayoutError("Please fill in all bank details.");
        setPayoutLoading(false);
        return;
      }
      body.bankName = bankName.trim();
      body.accountNumber = accountNumber.trim();
      body.accountName = accountName.trim();
    }

    const { data, error } = await supabase.functions.invoke("process-withdrawal", { body });

    if (error || data?.error) {
      setPayoutError(data?.error || error?.message || "Failed to submit payout request.");
      setPayoutLoading(false);
      return;
    }

    setPayoutSuccess(true);
    setPayoutLoading(false);
    await loadData();
    setTimeout(() => {
      setShowPayoutModal(false);
      setPayoutSuccess(false);
      setPayoutAmount("");
      setPhone("");
      setBusinessNumber("");
      setBankName("");
      setAccountNumber("");
      setAccountName("");
    }, 1500);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-KE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      completed: "bg-green-100 text-green-700",
      pending: "bg-amber-100 text-amber-700",
      processing: "bg-blue-100 text-blue-700",
      failed: "bg-red-100 text-red-700",
    };
    return map[status] ?? "bg-gray-100 text-gray-500";
  }

  function bookingStatusBadge(status: string) {
    const map: Record<string, string> = {
      completed: "bg-blue-100 text-blue-700",
      pending: "bg-amber-100 text-amber-700",
      confirmed: "bg-green-100 text-green-700",
      cancelled: "bg-gray-100 text-gray-500",
      no_show: "bg-gray-100 text-gray-500",
    };
    return map[status] ?? "bg-gray-100 text-gray-500";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-sm">Loading revenue...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Revenue & Payouts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Track your earnings and request withdrawals
        </p>
      </div>

      {/* Balance card */}
      <div className="bg-gray-900 text-white rounded-2xl p-6 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-400 mb-1">Available to Withdraw</p>
          <p className="text-4xl font-bold">
            KES {availableBalance.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            After 15% platform fee · Paid out: KES{" "}
            {totalPaidOut.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <button
          onClick={() => {
            setPayoutError("");
            setPayoutSuccess(false);
            setShowPayoutModal(true);
          }}
          disabled={availableBalance <= 0}
          className="px-6 py-3 bg-white text-gray-900 rounded-full text-sm font-semibold hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed self-start md:self-auto flex-shrink-0"
        >
          Request Payout
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Total Earned",
            value: `KES ${totalEarned.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`,
            sub: "All time (net)",
          },
          {
            label: "This Month",
            value: `KES ${thisMonthEarnings.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`,
            sub: "Completed sessions",
          },
          {
            label: "Upcoming",
            value: `KES ${upcomingEarnings.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`,
            sub: "Confirmed sessions",
          },
          {
            label: "No-shows",
            value: String(noShowCount),
            sub: "Total sessions",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">
              {stat.label}
            </p>
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Session history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Session History</h2>
        </div>
        {bookings.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">No sessions yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {bookings.map((b) => {
              const earning = b.status === "completed" ? calcEarning(b) : null;
              return (
                <div
                  key={b.id}
                  className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {b.users?.full_name ?? "Client"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {b.pt_offerings?.title ?? "Session"} &middot; {formatDate(b.scheduled_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {earning !== null && (
                      <p className="text-sm font-semibold text-gray-900">
                        KES {earning.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                      </p>
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${bookingStatusBadge(b.status)}`}
                    >
                      {b.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payout history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Payout History</h2>
        </div>
        {payouts.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            No payout requests yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    KES {p.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {p.destination_type === "MPESA_PAYBILL"
                      ? `Paybill ${p.business_number ?? ""} · ${p.account_number ?? ""}`
                      : p.method === "mpesa"
                      ? `M-Pesa · ${p.phone ?? ""}`
                      : `${p.bank_name ?? "Bank"} · ${p.account_number ?? ""}`}{" "}
                    &middot; {formatDate(p.created_at.slice(0, 10))}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusBadge(p.status)}`}
                >
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payout Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => !payoutLoading && setShowPayoutModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Request Payout</h2>
              <button
                onClick={() => !payoutLoading && setShowPayoutModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {payoutSuccess ? (
              <div className="py-8 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">Payout request submitted!</p>
                <p className="text-xs text-gray-500 mt-1">We'll process it within 2-3 business days.</p>
              </div>
            ) : (
              <form onSubmit={handlePayoutSubmit} className="space-y-4">
                {payoutError && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                    {payoutError}
                  </div>
                )}

                {/* Available balance reminder */}
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                  Available:{" "}
                  <span className="font-semibold">
                    KES {availableBalance.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </span>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (KES)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={100}
                      max={availableBalance}
                      step={1}
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPayoutAmount(
                          availableBalance.toFixed(0)
                        )
                      }
                      className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
                    >
                      Max
                    </button>
                  </div>
                </div>

                {/* Method selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Withdrawal Method
                  </label>
                  <div className="flex gap-3">
                    {(["mpesa", "paybill", "bank"] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPayoutMethod(method)}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition ${
                          payoutMethod === method
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {method === "mpesa" ? "M-Pesa" : method === "paybill" ? "Paybill" : "Bank Transfer"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* M-Pesa fields */}
                {payoutMethod === "mpesa" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      M-Pesa Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 0712345678"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                      required
                    />
                  </div>
                )}

                {/* Paybill fields */}
                {payoutMethod === "paybill" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Paybill Business Number
                      </label>
                      <input
                        type="text"
                        value={businessNumber}
                        onChange={(e) => setBusinessNumber(e.target.value)}
                        placeholder="e.g. 522522"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="Account / store number"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Bank fields */}
                {payoutMethod === "bank" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="e.g. Equity Bank"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="Account number"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Name
                      </label>
                      <input
                        type="text"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="Account holder name"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                        required
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={payoutLoading}
                  className="w-full bg-black text-white py-3 rounded-full text-sm font-medium hover:bg-gray-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {payoutLoading ? "Submitting..." : "Submit Payout Request"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
