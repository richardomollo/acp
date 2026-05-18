import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kdmhmkwzanqnwehcddvr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbWhta3d6YW5xbndlaGNkZHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTI1NjMsImV4cCI6MjA4MzU2ODU2M30.j_Hy6AdylKECnp_f61EIl1B-_MgZ0VlF8RFNBKOz5_o';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    // React Native registers WebSocket after module initialisation, so it may
    // be undefined here. This app only uses auth — no realtime channels —
    // so the fallback class is never actually instantiated.
    transport: (global as any).WebSocket ?? class {},
  },
});
