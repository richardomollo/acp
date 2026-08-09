
import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = 'https://kdmhmkwzanqnwehcddvr.supabase.co';
const supabaseAnonKey = 'sb_publishable_uV5cQ7DrYiJePBl2gPkUyg_QS9mEiSv';

// Only use AsyncStorage on native
const isWeb = Platform.OS === 'web'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isWeb ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb,
    flowType: 'implicit',
  },
})

// When Supabase can't refresh the token it fires SIGNED_OUT automatically
// and clears AsyncStorage — no extra action needed on our side.
// This listener just swallows the console error so it doesn't surface as a crash.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    // Session cleared — the root index.tsx will show the splash screen.
  }
})


