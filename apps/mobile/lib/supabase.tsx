import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kdmhmkwzanqnwehcddvr.supabase.co';
const supabaseAnonKey = 'sb_publishable_uV5cQ7DrYiJePBl2gPkUyg_QS9mEiSv';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
  realtime: {
    // React Native registers WebSocket after module initialisation, so it may
    // be undefined here. This app only uses auth — no realtime channels —
    // so the fallback class is never actually instantiated.
    transport: (global as any).WebSocket ?? class {},
  },
});
