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
  id: string
  email: string
  name: string
  phone: string
  credits: number
  subscription_tier: string
  subscription_status: string
  trial_end_date: string
  subscription_end_date: string
}

type CreditTransaction = {
  id: string
  transaction_type: string
  credits: number
  balance_after: number
  description: string
  created_at: string
}

type Booking = {
  id: string
  booking_date: string
  booking_time: string
  confirmation_code: string
  status: string
  credits_used: number
  sessions: { name: string; instructor: string } | null
}

type Tab = 'account' | 'billing' | 'charges' | 'bookings' | 'settings'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('account')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }
      setUser(session.user)

      const [profileRes, bookingsRes, txRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', session.user.id).single(),
        supabase
          .from('bookings')
          .select('*, sessions(name, instructor)')
          .eq('user_id', session.user.id)
          .eq('status', 'confirmed')
          .gte('booking_date', new Date().toISOString().split('T')[0])
          .order('booking_date', { ascending: true })
          .limit(10),
        supabase
          .from('credit_transactions')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      setProfile(profileRes.data)
      setForm({ name: profileRes.data?.name || '', phone: profileRes.data?.phone || '' })
      setBookings(bookingsRes.data || [])
      setTransactions(txRes.data || [])
      setLoading(false)
    }
    init()
  }, [router])

  const saveProfile = async () => {
    if (!user) return
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)

    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = session?.access_token
    if (!accessToken) { setSaveError('Not authenticated'); setSaving(false); return }

    const res = await fetch('/api/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, phone: form.phone, accessToken }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setSaveError(json.error || 'Failed to save'); return }

    setProfile(prev => prev ? { ...prev, name: form.name, phone: form.phone } : prev)
    setSaveSuccess(true)
    setEditing(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Loading…</p>
    </div>
  )

  const isTrial = profile?.subscription_tier === 'free_trial'
  const isExpired = profile?.subscription_status === 'expired'
  const trialEnd = profile?.trial_end_date ? new Date(profile.trial_end_date) : null
  const daysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86400000) : 0
  const planLabel = profile?.subscription_tier?.replace(/_/g, ' ') ?? '—'

  const navItems: { id: Tab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'billing', label: 'Billing' },
    { id: 'charges', label: 'Recent charges' },
    { id: 'bookings', label: 'My Bookings' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 md:px-16 lg:px-24 xl:px-32 py-12 flex gap-16">

        {/* ── Sidebar ── */}
        <aside className="w-44 flex-shrink-0">
          {/* Avatar */}
          <div className="mb-8">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 truncate">{profile?.name || user?.email}</p>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`text-left px-2 py-1.5 text-sm rounded transition-colors ${
                  tab === item.id
                    ? 'text-blue-600 font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">

          {/* ── ACCOUNT ── */}
          {tab === 'account' && (
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-6">Account</h1>
              <div className="grid md:grid-cols-2 gap-4">

                {/* Credits card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  {/* Top row */}
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-900">{profile?.credits ?? 0} credits left</p>
                      <p className="text-sm text-gray-500 capitalize">{planLabel}</p>
                      {isTrial && trialEnd && (
                        <p className="text-sm text-gray-500">
                          Trial ends {trialEnd.toLocaleDateString('en-KE', { day: 'numeric', month: 'long' })}
                        </p>
                      )}
                      {!isTrial && profile?.subscription_end_date && (
                        <p className="text-sm text-gray-500">
                          Renews {fmtDate(profile.subscription_end_date)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Plan info box */}
                  {isTrial && (
                    <div className="bg-gray-50 rounded-xl p-4 mb-5">
                      <p className="text-xs text-gray-500 mb-1">Your plan after trial</p>
                      <p className="text-sm font-bold text-gray-900 capitalize">{planLabel}</p>
                      <p className="text-sm text-gray-500">
                        {daysLeft > 0
                          ? `Begins in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                          : 'Trial ended'}
                      </p>
                    </div>
                  )}

                  {isExpired && (
                    <div className="bg-red-50 rounded-xl p-4 mb-5">
                      <p className="text-sm font-semibold text-red-700">Subscription expired</p>
                      <p className="text-xs text-red-500 mt-0.5">Renew to continue booking classes</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Link href="/subscriptions" className="flex-1">
                      <button className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-blue-700 transition">
                        Manage plan
                      </button>
                    </Link>
                    <Link href="/subscriptions" className="flex-1">
                      <button className="w-full bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-gray-700 transition">
                        Add credits
                      </button>
                    </Link>
                  </div>
                </div>

                {/* Account balance card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 mb-4">Account Balance</h2>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Available Credits</span>
                        <span>{profile?.credits ?? 0}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Upcoming Bookings</span>
                        <span>{bookings.length}</span>
                      </div>
                      <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
                        <span>Total Credits</span>
                        <span>{profile?.credits ?? 0}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setTab('bookings')}
                    className="mt-6 flex items-center justify-between w-full text-sm text-gray-600 bg-amber-50 rounded-xl px-4 py-3 hover:bg-amber-100 transition"
                  >
                    <span>View your upcoming bookings</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-500 mt-6">
                Questions?{' '}
                <a href="mailto:support@activecitypass.com" className="text-blue-600 hover:underline">
                  Reach out to us.
                </a>
              </p>
            </div>
          )}

          {/* ── BILLING ── */}
          {tab === 'billing' && (
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-6">Billing</h1>
              <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Current Plan</p>
                    <p className="text-lg font-bold text-gray-900 capitalize">{planLabel}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    isExpired ? 'bg-red-100 text-red-700'
                    : isTrial ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700'
                  }`}>
                    {isExpired ? 'Expired' : isTrial ? 'Trial' : 'Active'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                  <div>
                    <p className="text-gray-400 mb-0.5">Credits remaining</p>
                    <p className="font-semibold text-gray-900">{profile?.credits ?? 0}</p>
                  </div>
                  {isTrial && trialEnd && (
                    <div>
                      <p className="text-gray-400 mb-0.5">Trial ends</p>
                      <p className="font-semibold text-gray-900">{fmtDate(profile!.trial_end_date)}</p>
                    </div>
                  )}
                  {!isTrial && profile?.subscription_end_date && (
                    <div>
                      <p className="text-gray-400 mb-0.5">Next renewal</p>
                      <p className="font-semibold text-gray-900">{fmtDate(profile.subscription_end_date)}</p>
                    </div>
                  )}
                </div>

                <Link href="/subscriptions">
                  <button className="bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-700 transition">
                    {isExpired ? 'Renew subscription' : 'Manage subscription'}
                  </button>
                </Link>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Need more credits?</h2>
                <p className="text-sm text-gray-500 mb-4">Top up your account to keep booking classes and activities.</p>
                <Link href="/subscriptions">
                  <button className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-blue-700 transition">
                    Add credits
                  </button>
                </Link>
              </div>
            </div>
          )}

          {/* ── RECENT CHARGES ── */}
          {tab === 'charges' && (
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-6">Recent charges</h1>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {transactions.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-12">No transactions yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {transactions.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{tx.description || tx.transaction_type}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(tx.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}
                            {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${
                            tx.transaction_type === 'debit' ? 'text-red-500' : 'text-green-600'
                          }`}>
                            {tx.transaction_type === 'debit' ? '−' : '+'}{tx.credits} cr
                          </p>
                          <p className="text-xs text-gray-400">Balance: {tx.balance_after}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── BOOKINGS ── */}
          {tab === 'bookings' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">My Bookings</h1>
                <Link href="/sessions">
                  <button className="text-sm bg-gray-900 text-white px-5 py-2 rounded-full hover:bg-gray-700 transition font-medium">
                    Book a class
                  </button>
                </Link>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {bookings.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-gray-400 text-sm mb-4">No upcoming bookings.</p>
                    <Link href="/sessions" className="text-blue-600 text-sm font-medium hover:underline">
                      Browse classes →
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {bookings.map(b => (
                      <div key={b.id} className="flex items-center justify-between px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{b.sessions?.name ?? '—'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {b.sessions?.instructor && `with ${b.sessions.instructor} · `}
                            {fmtDate(b.booking_date)} · {b.booking_time?.slice(0, 5)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">
                            Code: {b.confirmation_code}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">
                            Confirmed
                          </span>
                          <span className="text-xs text-gray-400">{b.credits_used} cr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {tab === 'settings' && (
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>

              <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">Profile</h2>
                  {!editing && (
                    <button
                      onClick={() => { setEditing(true); setSaveSuccess(false); setSaveError(''); }}
                      className="text-xs text-blue-600 font-medium hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {saveError && (
                  <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg mb-4">{saveError}</div>
                )}
                {saveSuccess && (
                  <div className="bg-green-50 text-green-700 text-xs px-3 py-2 rounded-lg mb-4">Profile updated successfully.</div>
                )}

                {editing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Name</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900"
                          placeholder="Your name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900"
                          placeholder="+254 700 000000"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Email</label>
                      <input
                        type="email"
                        value={user?.email}
                        disabled
                        className="w-full px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-400 mt-1">Email cannot be changed here.</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveProfile}
                        disabled={saving}
                        className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-full hover:bg-gray-700 transition disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        onClick={() => { setEditing(false); setForm({ name: profile?.name || '', phone: profile?.phone || '' }); setSaveError(''); }}
                        className="px-5 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    <div>
                      <p className="text-gray-400 mb-0.5">Name</p>
                      <p className="font-medium text-gray-900">{profile?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Email</p>
                      <p className="font-medium text-gray-900">{user?.email}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Phone</p>
                      <p className="font-medium text-gray-900">{profile?.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Member since</p>
                      <p className="font-medium text-gray-900">{user?.created_at ? fmtDate(user.created_at) : '—'}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Password</h2>
                <p className="text-sm text-gray-500 mb-4">Change your account password via email reset.</p>
                <button
                  onClick={async () => {
                    await supabase.auth.resetPasswordForEmail(user.email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    })
                    alert('Password reset email sent.')
                  }}
                  className="text-sm text-blue-600 font-medium hover:underline"
                >
                  Send password reset email →
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Sign out</h2>
                <p className="text-sm text-gray-500 mb-4">You'll be redirected to the login page.</p>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut()
                    router.replace('/login')
                  }}
                  className="text-sm font-semibold text-red-600 border border-red-200 px-5 py-2 rounded-full hover:bg-red-50 transition"
                >
                  Log out
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}
