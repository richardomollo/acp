import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: false,
    });

    if (authError) {
      return NextResponse.json({ success: false, error: authError.message }, { status: 400 });
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
        is_active: false,
        latitude: data.latitude,
        longitude: data.longitude,
      })
      .select()
      .single();

    if (gymError) {
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ success: false, error: gymError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Gym account created successfully! Check your email to verify.',
      gymId: gymData.id,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}