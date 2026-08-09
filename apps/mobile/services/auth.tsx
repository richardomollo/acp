import { supabase } from '@/lib/supabase';

export const signInWithApple = async (identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null } | null) => {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Sign-in failed');

  const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ');
  await supabase.from('users').upsert({
    id: data.user.id,
    email: data.user.email ?? '',
    name: name || data.user.user_metadata?.full_name || '',
  }, { onConflict: 'id', ignoreDuplicates: true });

  return data;
};

export const signInWithGoogle = async (idToken: string) => {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Sign-in failed');

  // Upsert profile so Google users have a row in `users`
  await supabase.from('users').upsert({
    id: data.user.id,
    email: data.user.email ?? '',
    name: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? '',
    phone: data.user.user_metadata?.phone ?? '',
  }, { onConflict: 'id', ignoreDuplicates: true });

  return data;
};

export interface SignUpData {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
}

export const authService = {
  async signup(data: SignUpData) {
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            phone: data.phone,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      // 2. Create user profile
      const { error: profileError } = await supabase
        .from('users')
        .insert([
          {
            id: authData.user.id,
            email: data.email,
            name: data.name,
            phone: data.phone,
          },
        ]);

      if (profileError) {
        console.error('Profile creation error:', profileError);
      }

      return {
        user: {
          id: authData.user.id,
          email: data.email,
          name: data.name,
          phone: data.phone,
        },
        session: authData.session,
      };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign up');
    }
  },

  async login(data: LoginData) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Login failed');

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
      }

      return {
        user: {
          id: authData.user.id,
          email: authData.user.email || data.email,
          name: profile?.name || authData.user.user_metadata?.name || '',
          phone: profile?.phone || authData.user.user_metadata?.phone || '',
        },
        session: authData.session,
      };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to login');
    }
  },

  async forgotPassword(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://activecitypass.com/auth/app-redirect?app=mobile',
      });

      if (error) throw error;

      return { message: 'Password reset email sent' };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to send reset email');
    }
  },

  async logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to logout');
    }
  },

  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) throw error;
      if (!user) return null;

      // Get user profile
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      return {
        id: user.id,
        email: user.email || '',
        name: profile?.name || user.user_metadata?.name || '',
        phone: profile?.phone || user.user_metadata?.phone || '',
      };
    } catch (error) {
      return null;
    }
  },

  async getSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (error) {
      return null;
    }
  },

  async isAuthenticated() {
    const session = await this.getSession();
    return !!session;
  },
};