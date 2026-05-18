import { supabase } from "./supabase";

export async function createNewUser(userId: string, email: string) {
  const trialEndsAt = new Date();
  trialEndsAt.setMonth(trialEndsAt.getMonth() + 1); // 1 month trial

  const { data, error } = await supabase
    .from("users") // match your table name
    .insert([
      {
        id: userId,
        email,
        credits: 10,
        trial_ends_at: trialEndsAt.toISOString(),
      },
    ]);

  if (error) {
    console.error("Database error saving new user:", error);
    return { success: false, error };
  }

  return { success: true, data };
}
