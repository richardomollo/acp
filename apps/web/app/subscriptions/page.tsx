"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { purchaseCredits } from "../actions/credit-bookings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SubscriptionPlan = {
  tier: string;
  name: string;
  credits: number;
  price: number;
  description: string;
};

type UserProfile = {
  credits: number;
  subscription_tier: string;
  trial_end_date: string;
};

type WalletSummaryResponse = {
  walletExists: boolean;
  summary: {
    balance: {
      balance: string;
      currency: string;
    };
  } | null;
};

type PurchaseResult = {
  success: boolean;
  message?: string;
  error?: string;
  needsTopup?: boolean;
  creditsAdded?: number;
  paymentReference?: string;
  transactionId?: string;
  walletBalance?: string;
};

type FeedbackModal = {
  open: boolean;
  tone: "success" | "warning" | "error";
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(amount);

export default function SubscriptionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletCurrency, setWalletCurrency] = useState("KES");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackModal>({
    open: false,
    tone: "success",
    title: "",
    body: "",
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUser(user);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    const walletPromise = accessToken
      ? fetch("/api/wallet/summary", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
          .then(async (response) => {
            const data = (await response.json()) as WalletSummaryResponse | { error?: string };
            if (!response.ok) return null;
            if ("summary" in data && data.summary?.balance?.balance) {
              return data.summary.balance;
            }
            return null;
          })
          .catch(() => null)
      : Promise.resolve(null);

    const [profileRes, plansRes, walletRes] = await Promise.all([
      supabase.from("users").select("credits, subscription_tier, trial_end_date").eq("id", user.id).single(),
      supabase.from("subscription_plans").select("*").eq("is_active", true).neq("tier", "free_trial").order("price", { ascending: true }),
      walletPromise,
    ]);

    setUserProfile(profileRes.data);
    setPlans(plansRes.data || []);
    setWalletBalance(walletRes ? Number(walletRes.balance) : null);
    setWalletCurrency(walletRes?.currency || "KES");
    setLoading(false);
  };

  const handlePurchase = async (tier: string) => {
    if (!user) return;
    setPurchasing(tier);
    const result = await purchaseCredits(user.id, tier) as PurchaseResult;
    setPurchasing(null);
    if (result.success) {
      await load();
      router.refresh();
      const balanceLine = result.walletBalance
        ? ` Remaining wallet balance: KES ${result.walletBalance}.`
        : "";
      const referenceLine = result.paymentReference
        ? ` Reference: ${result.paymentReference}.`
        : "";
      setFeedback({
        open: true,
        tone: "success",
        title: "Payment successful",
        body: `${result.message || "Your plan has been activated."}${balanceLine}${referenceLine}`,
      });
    } else {
      setFeedback({
        open: true,
        tone: result.needsTopup ? "warning" : "error",
        title: result.needsTopup ? "Top up required" : "Payment failed",
        body: result.error || "Purchase failed",
        ctaLabel: result.needsTopup ? "Open wallet" : undefined,
        ctaHref: result.needsTopup ? "/wallet" : undefined,
      });
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Loading…</p>
    </div>
  );

  const isTrial = userProfile?.subscription_tier === "free_trial";
  const daysLeft = userProfile?.trial_end_date
    ? Math.ceil((new Date(userProfile.trial_end_date).getTime() - Date.now()) / 86400000)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="w-full px-6 md:px-16 lg:px-24 xl:px-32">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold text-gray-900">Plans &amp; Credits</h1>
          <p className="text-sm text-gray-500 mt-1">Choose a credit package that fits your routine.</p>
        </div>

        {/* Current status bar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Current plan</p>
            <p className="text-sm font-semibold text-gray-900 capitalize">
              {userProfile?.subscription_tier?.replace(/_/g, " ") ?? "—"}
            </p>
            {isTrial && daysLeft > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">Trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 mb-0.5">Available credits</p>
            <p className="text-2xl font-bold text-gray-900">{userProfile?.credits ?? 0}</p>
          </div>
        </div>

        <div className="bg-gray-900 text-white rounded-3xl p-6 mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Wallet</p>
            <h2 className="mt-2 text-xl font-semibold">
              {walletBalance !== null
                ? `${walletCurrency} balance: ${formatCurrency(walletBalance)}`
                : "Top up before you buy"}
            </h2>
            <p className="mt-1 text-sm text-gray-300 max-w-2xl">
              {walletBalance !== null
                ? "Plan purchases now check wallet balance first and deduct from wallet before adding credits."
                : "Use the wallet for M-Pesa top-ups, wallet balance checks, and transaction statement tracking."}
            </p>
          </div>
          <Link href="/wallet" className="shrink-0">
            <button className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100">
              {walletBalance !== null ? "Manage wallet" : "Open wallet"}
            </button>
          </Link>
        </div>

        {/* Trial notice */}
        {isTrial && daysLeft > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-8">
            <p className="text-sm font-semibold text-blue-900 mb-1">You're on a free trial</p>
            <p className="text-sm text-blue-700">
              You have {userProfile?.credits} credits to explore our venues. Upgrade below to keep going after your trial ends.
            </p>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {plans.map((plan) => {
            const isPopular = plan.tier === "flex";
            const costPerCredit = (plan.price / plan.credits).toFixed(0);
            const canAfford = walletBalance !== null && walletBalance >= Number(plan.price);
            const savings =
              plan.tier === "power" ? "Save 29%" :
              plan.tier === "flex"  ? "Save 11%" : null;

            return (
              <div
                key={plan.tier}
                className={`bg-white rounded-2xl border p-5 flex flex-col transition ${
                  isPopular
                    ? "border-gray-900 ring-1 ring-gray-900"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {isPopular && (
                  <span className="self-start text-xs font-semibold bg-gray-900 text-white px-2.5 py-0.5 rounded-full mb-3">
                    Most popular
                  </span>
                )}

                <p className="text-sm font-bold text-gray-900 mb-1">{plan.name}</p>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">{plan.description}</p>

                <div className="mt-auto">
                  <p className="text-2xl font-bold text-gray-900">
                    KES {plan.price.toLocaleString()}
                    {plan.tier !== "pay_as_you_go" && (
                      <span className="text-sm font-normal text-gray-400">/mo</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">{plan.credits} credits</p>
                  <p className="text-xs text-gray-400">KES {costPerCredit} per credit</p>
                  <p className={`text-xs mt-1 ${canAfford ? "text-green-600" : "text-amber-600"}`}>
                    {walletBalance === null
                      ? "Top up wallet to buy this plan"
                      : canAfford
                        ? "Wallet balance is enough for this plan"
                        : `Need ${formatCurrency(Number(plan.price) - walletBalance)} more in wallet`}
                  </p>
                  {savings && (
                    <p className="text-xs font-semibold text-green-600 mt-1">{savings}</p>
                  )}

                  {canAfford ? (
                    <button
                      onClick={() => handlePurchase(plan.tier)}
                      disabled={!!purchasing}
                      className={`w-full mt-4 py-2.5 rounded-full text-sm font-semibold transition disabled:opacity-50 ${
                        isPopular
                          ? "bg-gray-900 text-white hover:bg-gray-700"
                          : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      {purchasing === plan.tier ? "Processing…" : "Buy with wallet"}
                    </button>
                  ) : (
                    <Link href="/wallet" className="block mt-4">
                      <button
                        className={`w-full py-2.5 rounded-full text-sm font-semibold transition ${
                          isPopular
                            ? "bg-gray-900 text-white hover:bg-gray-700"
                            : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                        }`}
                      >
                        Top up wallet
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* How credits work */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-5">How credits work</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: "💳", title: "Purchase credits", body: "Choose a plan and credits are added to your account instantly." },
              { icon: "🏋️", title: "Book classes", body: "Each class booking uses credits. Browse 100+ gyms and studios across Nairobi." },
              { icon: "🔄", title: "Cancel anytime", body: "Cancel a booking and your credits come back immediately." },
            ].map(item => (
              <div key={item.title} className="flex gap-3">
                <span className="text-xl mt-0.5">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">{item.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Common questions</h2>
          <div className="space-y-4 text-sm">
            {[
              { q: "Do credits expire?", a: "Monthly subscription credits expire at end of billing cycle. Pay-as-you-go credits never expire." },
              { q: "Can I cancel my subscription?", a: "Yes — cancel anytime. Unused credits remain valid until the end of your billing period." },
              { q: "What if I cancel a booking?", a: "Credits are immediately refunded when you cancel a confirmed booking." },
            ].map(item => (
              <div key={item.q} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <p className="font-medium text-gray-900 mb-0.5">{item.q}</p>
                <p className="text-gray-500">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-gray-400 text-center mt-8">
          Questions?{" "}
          <a href="mailto:support@activecitypass.com" className="text-blue-600 hover:underline">
            Reach out to us.
          </a>
        </p>

        {feedback.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                    feedback.tone === "success"
                      ? "text-green-600"
                      : feedback.tone === "warning"
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}>
                    {feedback.tone === "success"
                      ? "Success"
                      : feedback.tone === "warning"
                        ? "Action needed"
                        : "Error"}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-gray-900">{feedback.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-600">{feedback.body}</p>
                </div>
                <button
                  onClick={() => setFeedback((current) => ({ ...current, open: false }))}
                  className="text-gray-400 transition hover:text-gray-700"
                  aria-label="Close feedback modal"
                >
                  ✕
                </button>
              </div>

              <div className="mt-6 flex gap-3">
                {feedback.ctaHref && feedback.ctaLabel ? (
                  <Link href={feedback.ctaHref} className="flex-1">
                    <button
                      onClick={() => setFeedback((current) => ({ ...current, open: false }))}
                      className="w-full rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700"
                    >
                      {feedback.ctaLabel}
                    </button>
                  </Link>
                ) : null}
                <button
                  onClick={() => setFeedback((current) => ({ ...current, open: false }))}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                    feedback.ctaHref ? "flex-1 bg-gray-100 text-gray-900 hover:bg-gray-200" : "w-full bg-gray-900 text-white hover:bg-gray-700"
                  }`}
                >
                  {feedback.ctaHref ? "Close" : "Continue"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
