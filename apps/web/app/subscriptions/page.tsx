// ============================================
// FILE: app/subscriptions/page.tsx
// Subscription plans and credit purchase
// ============================================
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
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

export default function SubscriptionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  const checkAuthAndLoadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/login');
      return;
    }

    setUser(user);

    // Fetch user profile
    const { data: profile } = await supabase
      .from('users')
      .select('credits, subscription_tier, trial_end_date')
      .eq('id', user.id)
      .single();

    setUserProfile(profile);

    // Fetch subscription plans
    const { data: plansData } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .neq('tier', 'free_trial')
      .order('price', { ascending: true });

    setPlans(plansData || []);
    setLoading(false);
  };

  const handlePurchase = async (tier: string) => {
    if (!user) return;

    setPurchasing(true);
    const result = await purchaseCredits(user.id, tier);
    setPurchasing(false);

    if (result.success) {
      alert(result.message);
      await checkAuthAndLoadData();
      router.refresh();
    } else {
      alert(result.error || 'Purchase failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const isTrial = userProfile?.subscription_tier === 'free_trial';
  const daysLeft = userProfile?.trial_end_date 
    ? Math.ceil((new Date(userProfile.trial_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Choose Your Plan</h1>
          <p className="text-xl text-gray-600">Flexible credit packages for every fitness goal</p>
        </div>

        {/* Current Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Your Account</h3>
              <p className="text-sm text-gray-600 mt-1">
                Current Plan: <span className="font-semibold capitalize">{userProfile?.subscription_tier?.replace('_', ' ')}</span>
              </p>
              {isTrial && daysLeft > 0 && (
                <p className="text-sm text-orange-600 mt-1">
                  Trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Available Credits</p>
              <p className="text-3xl font-bold text-indigo-600">{userProfile?.credits || 0}</p>
            </div>
          </div>
        </div>

        {/* Trial Banner */}
        {isTrial && (
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-lg p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-2">Welcome to FitPass! 🎉</h2>
            <p className="text-lg mb-4">
              You have {userProfile?.credits || 0} trial credits to explore our best gyms and studios
            </p>
            <div className="bg-white/20 rounded-lg p-4 mb-4">
              <p className="text-sm">
                <strong>Trial Benefits:</strong>
              </p>
              <ul className="text-sm mt-2 space-y-1">
                <li>• Visit 10 different gyms/studios</li>
                <li>• One visit per location</li>
                <li>• Credits expire in {daysLeft} days</li>
              </ul>
            </div>
            <p className="text-sm">
              Upgrade now to unlock unlimited bookings at all locations!
            </p>
          </div>
        )}

        {/* Subscription Plans */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {plans.map((plan) => {
            const isPopular = plan.tier === 'flex';
            const costPerCredit = plan.price / plan.credits;
            const savings = plan.tier === 'power' ? '29% savings' : 
                           plan.tier === 'flex' ? '11% savings' : null;

            return (
              <div
                key={plan.tier}
                className={`bg-white rounded-lg shadow-md overflow-hidden ${
                  isPopular ? 'ring-2 ring-indigo-600 transform scale-105' : ''
                }`}
              >
                {isPopular && (
                  <div className="bg-indigo-600 text-white text-center py-2 text-sm font-semibold">
                    MOST POPULAR
                  </div>
                )}
                
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  
                  <div className="mb-4">
                    <span className="text-3xl font-bold text-gray-900">
                      KES {plan.price.toLocaleString()}
                    </span>
                    {plan.tier !== 'pay_as_you_go' && (
                      <span className="text-gray-600 text-sm">/month</span>
                    )}
                  </div>

                  <div className="mb-4">
                    <p className="text-2xl font-semibold text-indigo-600">
                      {plan.credits} {plan.tier === 'pay_as_you_go' ? 'Credit' : 'Credits'}
                    </p>
                    <p className="text-sm text-gray-500">
                      KES {costPerCredit.toFixed(0)} per credit
                    </p>
                    {savings && (
                      <p className="text-sm text-green-600 font-semibold mt-1">
                        {savings}
                      </p>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 mb-6 h-12">
                    {plan.description}
                  </p>

                  <button
                    onClick={() => handlePurchase(plan.tier)}
                    disabled={purchasing}
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition ${
                      isPopular
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    } disabled:bg-gray-300`}
                  >
                    {purchasing ? 'Processing...' : 'Purchase'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* How It Works */}
        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">How Credits Work</h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">💳</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Purchase Credits</h3>
              <p className="text-sm text-gray-600">
                Choose a plan that fits your fitness routine. Credits are added instantly.
              </p>
            </div>

            <div>
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">🏋️</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Book Classes</h3>
              <p className="text-sm text-gray-600">
                Each class booking uses 1 credit. Browse and book from 100+ gyms and studios.
              </p>
            </div>

            <div>
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">🔄</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Flexible & Fair</h3>
              <p className="text-sm text-gray-600">
                Cancel bookings and get credits back. Monthly credits expire at end of billing cycle.
              </p>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">Frequently Asked Questions</h3>
          <div className="space-y-3 text-sm text-blue-800">
            <div>
              <p className="font-semibold">Do credits expire?</p>
              <p>Monthly subscription credits expire at the end of your billing cycle. Pay-as-you-go credits don't expire.</p>
            </div>
            <div>
              <p className="font-semibold">Can I cancel anytime?</p>
              <p>Yes! You can cancel your subscription anytime. Unused credits remain valid until end of billing period.</p>
            </div>
            <div>
              <p className="font-semibold">What happens if I cancel a booking?</p>
              <p>Credits are immediately refunded to your account when you cancel a booking.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}