// app/users/dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type UserProfile = {
  id: string;
  email: string;
  name: string;
  phone: string;
  credits: number;
  subscription_tier: string;
  subscription_status: string;
  trial_end_date: string;
  subscription_end_date: string;
}

type CreditTransaction = {
  id: string;
  transaction_type: string;
  credits: number;
  balance_after: number;
  description: string;
  created_at: string;
}

type Booking = {
  id: string;
  booking_date: string;
  booking_time: string;
  confirmation_code: string;
  status: string;
  credits_used: number;
  sessions: {
    name: string;
    instructor: string;
  };
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([])
  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login')
        return
      }

      setUser(session.user)
      await fetchUserData(session.user.id)
      setLoading(false)
    }

    init()
  }, [router])

  const fetchUserData = async (userId: string) => {
    // Fetch user profile
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    setUserProfile(profile)

    // Fetch upcoming bookings
    const today = new Date().toISOString().split('T')[0]
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        sessions (
          name,
          instructor
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
      .limit(5)

    setUpcomingBookings(bookings || [])

    // Fetch recent credit transactions
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    setRecentTransactions(transactions || [])
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading…</p>
    </div>
  )

  const isTrial = userProfile?.subscription_tier === 'free_trial'
  const daysLeft = userProfile?.trial_end_date 
    ? Math.ceil((new Date(userProfile.trial_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0
  
  const isExpired = userProfile?.subscription_status === 'expired'

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Welcome back{userProfile?.name ? `, ${userProfile.name}` : ''}!</h1>
            <p className="text-gray-600 mt-1">Manage your fitness journey</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            Log out
          </button>
        </header>

        {/* Credits & Subscription Overview */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Credits Card */}
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm opacity-90">Available Credits</p>
                <p className="text-4xl font-bold mt-2">{userProfile?.credits || 0}</p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
            </div>
            <Link href="/subscriptions">
              <button className="w-full bg-white text-indigo-600 py-2 rounded-lg font-semibold hover:bg-gray-100 transition text-sm">
                Buy More Credits
              </button>
            </Link>
          </div>

          {/* Subscription Status Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-600 mb-2">Subscription Plan</p>
            <p className="text-2xl font-bold text-gray-900 capitalize mb-2">
              {userProfile?.subscription_tier?.replace('_', ' ')}
            </p>
            <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
              isExpired ? 'bg-red-100 text-red-700' :
              isTrial ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>
              {isExpired ? 'Expired' : isTrial ? 'Trial Active' : 'Active'}
            </div>
            {isTrial && daysLeft > 0 && (
              <p className="text-sm text-gray-600 mt-3">
                Trial ends in <span className="font-semibold">{daysLeft}</span> day{daysLeft !== 1 ? 's' : ''}
              </p>
            )}
            {!isTrial && userProfile?.subscription_end_date && (
              <p className="text-sm text-gray-600 mt-3">
                Renews on {new Date(userProfile.subscription_end_date).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Quick Stats Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-600 mb-2">Upcoming Classes</p>
            <p className="text-2xl font-bold text-gray-900 mb-2">
              {upcomingBookings.length}
            </p>
            <Link href="/bookings">
              <button className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold">
                View All Bookings →
              </button>
            </Link>
          </div>
        </div>

        {/* Trial Banner */}
        {isTrial && daysLeft > 0 && (
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 text-3xl">🎉</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">You're on a Free Trial!</h3>
                <p className="text-sm text-gray-700 mb-3">
                  You have {userProfile?.credits} credits to explore our gyms. Remember: you can visit each gym only once during trial.
                </p>
                <Link href="/subscriptions">
                  <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">
                    Upgrade Now
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Expired Banner */}
        {isExpired && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 text-3xl">⚠️</div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-2">Subscription Expired</h3>
                <p className="text-sm text-red-700 mb-3">
                  Your subscription has expired. Purchase credits to continue booking classes.
                </p>
                <Link href="/subscriptions">
                  <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition">
                    Renew Subscription
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* Upcoming Bookings */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Upcoming Classes</h2>
              <Link href="/bookings" className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold">
                View All
              </Link>
            </div>

            {upcomingBookings.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">No upcoming bookings</p>
                <Link href="/sessions">
                  <button className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm">
                    Browse Classes →
                  </button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.map((booking) => (
                  <div key={booking.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{booking.sessions?.name}</h3>
                        <p className="text-sm text-gray-600">with {booking.sessions?.instructor}</p>
                      </div>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                        Confirmed
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>📅 {new Date(booking.booking_date).toLocaleDateString()}</span>
                      <span>🕒 {booking.booking_time.substring(0, 5)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Code: <span className="font-mono font-semibold">{booking.confirmation_code}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Credit Activity */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>

            {recentTransactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-start justify-between border-b border-gray-100 pb-3 last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{transaction.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(transaction.created_at).toLocaleDateString()} at{' '}
                        {new Date(transaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className={`text-sm font-semibold ${
                        transaction.transaction_type === 'credit' ? 'text-green-600' : 
                        transaction.transaction_type === 'refund' ? 'text-blue-600' :
                        'text-red-600'
                      }`}>
                        {transaction.transaction_type === 'credit' || transaction.transaction_type === 'refund' ? '+' : ''}
                        {transaction.credits}
                      </p>
                      <p className="text-xs text-gray-500">Balance: {transaction.balance_after}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Account Details */}
        <section className="bg-white rounded-lg shadow-md p-6 mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Information</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Email</p>
              <p className="font-medium text-gray-900">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Member Since</p>
              <p className="font-medium text-gray-900">
                {new Date(user.created_at).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Last Sign In</p>
              <p className="font-medium text-gray-900">
                {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">User ID</p>
              <p className="font-mono text-sm text-gray-900">{user.id}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}