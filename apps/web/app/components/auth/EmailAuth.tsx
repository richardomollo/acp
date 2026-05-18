'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})

    setLoading(false)

    if (error) {
      alert(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <form onSubmit={handleSignup}>
      <input
        type="email"
        placeholder="Enter your email"
        className='w-full rounded-full border border-gray-200 px-4 py-2  h-12 mb-6'
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

       <p className="text-center text-sm text-gray-600 mb-6">By clicking any button below, you agree to the Terms of Use and acknowledge the Privacy Policy.</p>

      <button 
        disabled={loading}
        className='w-full bg-slate-800 hover:bg-black text-white px-6 py-3 rounded-full font-medium transition mb-4'
      >
        {loading ? 'Sending link…' : 'Continue'}
      </button>

      {sent && <p>Check your email for the sign-in link.</p>}
    </form>
  )
}
