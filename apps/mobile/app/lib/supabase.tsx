import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kdmhmkwzanqnwehcddvr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbWhta3d6YW5xbndlaGNkZHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTI1NjMsImV4cCI6MjA4MzU2ODU2M30.j_Hy6AdylKECnp_f61EIl1B-_MgZ0VlF8RFNBKOz5_o';
const supabaseServiceRole ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbWhta3d6YW5xbndlaGNkZHZyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk5MjU2MywiZXhwIjoyMDgzNTY4NTYzfQ.Fzo7tSMf0e3cKMK7TANvJmgVa--oOOhqXtDY3T2owok";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});


