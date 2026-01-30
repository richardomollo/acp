export type Session = {
  id: string;
  name: string;
  description?: string;
  time: string;
  date?: string;
  category: string;
  image_url?: string;
  instructor?: string;
  duration_minutes?: number;
  credits_required?: number;
  spots_left?: number;
  gym_id?: string;
  gyms?: {
    name: string;
    location: string;
    type: string;
    area?: string;
    description?: string;
    contact_email?: string;
    contact_phone?: string;
    image_url?: string;
  };
};

export type User = {
  id: string;
  email: string;
  name?: string;
  subscription_tier?: string;
  credits_balance?: number;
};

export type Booking = {
  id: string;
  user_id: string;
  session_id: string;
  gym_id: string;
  booking_date: string;
  booking_time: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  confirmation_code?: string;
  created_at: string;
};
