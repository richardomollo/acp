import { redirect } from "next/navigation";

// /lana-pro → the workspace Home. Onboarding lives at /lana-pro/onboarding and
// has its own layout; the workspace redirect/guard logic is in
// app/lana-pro/(app)/layout.tsx.
export default function LanaProIndex() {
  redirect("/lana-pro/home");
}
