"use client";

import { supabase } from "../../lib/supabase/client";

export default function GoogleLogin() {
  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  };

  return (
    <button
      onClick={signInWithGoogle}
      className="w-full bg-black text-white px-6 py-3 rounded-full font-medium transition mb-4">
      Continue with Google
    </button>
  );
}
