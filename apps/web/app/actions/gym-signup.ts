// app/actions/gym-signup.ts
'use server'

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type GymSignupData = {
  email: string;
  password: string;
  contactName: string;
  contactPhone: string;
  gymName: string;
  location: string;
  area: string;
  type: string;
  description: string;
  imageUrl: string;
  latitude: number;
  longitude: number;
};

export async function createGymAccount(data: GymSignupData) {
  try {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: false, // Require email confirmation
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    const userId = authData.user.id;

    // 2. Create gym entry
    const { data: gymData, error: gymError } = await supabase
      .from('gyms')
      .insert({
        name: data.gymName,
        location: data.location,
        area: data.area,
        type: data.type,
        rating: 0,
        image_url: data.imageUrl,
        description: data.description,
        contact_email: data.email,
        contact_phone: data.contactPhone,
        is_active: false, // Pending approval
        latitude: data.latitude,
        longitude: data.longitude,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (gymError) {
      // Rollback: delete the auth user if gym creation fails
      await supabase.auth.admin.deleteUser(userId);
      return { success: false, error: gymError.message };
    }

    // 3. Create user profile (optional, if you have a users table)
    // await supabase.from('users').insert({
    //   id: userId,
    //   email: data.email,
    //   name: data.contactName,
    //   phone: data.contactPhone,
    //   role: 'gym_owner',
    // });

    return {
      success: true,
      message: 'Gym account created successfully! Check your email to verify.',
      gymId: gymData.id,
    };

  } catch (error: any) {
    console.error('Gym signup error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
}