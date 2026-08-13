'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type UserProfile = {
  id: string
  email: string
  name: string
  phone: string
  subscription_tier: string
  subscription_status: string
  trial_end_date: string
  subscription_end_date: string
}


type Booking = {
  id: string
  booking_date: string
  booking_time: string
  confirmation_code: string
  status: string
  sessions: { name: string; instructor: string } | null
}

type Club = {
  community_id: string
  role: string
  communities: {
    id: string
    slug: string | null
    name: string
    category: string
    logo_url: string | null
    member_count: number
  } | null
}

type Tab = 'account' | 'bookings' | 'clubs' | 'settings'

const CATEGORY_LABEL: Record<string, string> = {
  running: 'Running', walking: 'Walking', cycling: 'Cycling', strength: 'Strength',
  boxing: 'Boxing', yoga: 'Yoga', pilates: 'Pilates', hiking: 'Hiking', dance: 'Dance',
  outdoor_fitness: 'Outdoor Fitness', football: 'Football', other: 'Other',
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
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

      const [profileRes, bookingsRes, clubsRes] = await Promise.all([
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
          .from('community_members')
          .select('community_id, role, communities(id, slug, name, category, logo_url, member_count)')
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
      ])

      setProfile(profileRes.data)
      setForm({ name: profileRes.data?.name || '', phone: profileRes.data?.phone || '' })
      setBookings(bookingsRes.data || [])
      // Supabase/PostgREST can return a to-one embed as either an object or a
      // single-item array depending on relationship resolution — normalize so
      // downstream rendering can safely assume a plain object or null.
      const normalizedClubs = ((clubsRes.data as any[]) || []).map((c) => ({
        ...c,
        communities: Array.isArray(c.communities) ? (c.communities[0] ?? null) : c.communities,
      }))
      setClubs(normalizedClubs)
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

  const navItems: { id: Tab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'bookings', label: 'My Bookings' },
    { id: 'clubs', label: 'My Clubs' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 md:px-16 lg:px-24 xl:px-32 py-6 md:py-12 flex flex-col md:flex-row md:gap-16">

        {/* ── Desktop sidebar ── */}
        <aside className="hidden md:block w-44 flex-shrink-0">
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

        {/* ── Mobile header + tab strip ── */}
        <div className="md:hidden mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 truncate">{profile?.name || user?.email}</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">

          {/* ── ACCOUNT ── */}
          {tab === 'account' && (
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-6">Account</h1>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
                <div className="bg-gray-50 rounded-xl p-3 md:p-4 mb-5">
                  <p className="text-2xl font-bold text-gray-900">{bookings.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">upcoming bookings</p>
                </div>
                <Link href="/sessions">
                  <button className="w-full bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-gray-700 transition">
                    Browse classes
                  </button>
                </Link>
              </div>
              <p className="text-sm text-gray-500 mt-6">
                Questions?{' '}
                <a href="mailto:support@activecitypass.com" className="text-blue-600 hover:underline">
                  Reach out to us.
                </a>
              </p>
            </div>
          )}

          {/* ── BOOKINGS ── */}
          {tab === 'bookings' && (
            <div>
              <div className="flex items-center justify-between mb-6 gap-3">
                <h1 className="text-2xl font-semibold text-gray-900">My Bookings</h1>
                <Link href="/sessions" className="flex-shrink-0">
                  <button className="text-sm bg-gray-900 text-white px-5 py-2 rounded-full hover:bg-gray-700 transition font-medium whitespace-nowrap">
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
                      <div key={b.id} className="flex items-start justify-between px-4 md:px-6 py-4 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{b.sessions?.name ?? '—'}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {b.sessions?.instructor && `with ${b.sessions.instructor} · `}
                            {fmtDate(b.booking_date)} · {b.booking_time?.slice(0, 5)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">
                            {b.confirmation_code}
                          </p>
                        </div>
                        <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0">
                          Confirmed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CLUBS ── */}
          {tab === 'clubs' && (
            <div>
              <div className="flex items-center justify-between mb-6 gap-3">
                <h1 className="text-2xl font-semibold text-gray-900">My Clubs</h1>
                <Link href="/community" className="flex-shrink-0">
                  <button className="text-sm bg-gray-900 text-white px-5 py-2 rounded-full hover:bg-gray-700 transition font-medium whitespace-nowrap">
                    Discover clubs
                  </button>
                </Link>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {clubs.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-gray-400 text-sm mb-4">You haven&apos;t joined any communities yet.</p>
                    <Link href="/community" className="text-blue-600 text-sm font-medium hover:underline">
                      Browse communities →
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {clubs.map(c => c.communities && (
                      <Link
                        key={c.community_id}
                        href={`/community/${c.communities.slug ?? c.communities.id}`}
                        className="flex items-center gap-3 px-4 md:px-6 py-4 hover:bg-gray-50 transition-colors"
                      >
                        {c.communities.logo_url ? (
                          <img src={c.communities.logo_url} alt={c.communities.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {(c.communities.name || '?')[0]}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.communities.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate capitalize">
                            {CATEGORY_LABEL[c.communities.category] ?? c.communities.category} · {c.communities.member_count} members
                          </p>
                        </div>
                        {(c.role === 'owner' || c.role === 'admin') && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 capitalize">
                            {c.role}
                          </span>
                        )}
                      </Link>
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

              <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 mb-4">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
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

              <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 mb-4">
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

              <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
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
