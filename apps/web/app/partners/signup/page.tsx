import { redirect } from "next/navigation";
import { isLanaProEnabled, LANA_PRO_ONBOARDING } from "@/lib/lana-pro-flags";
import PartnersLanding from "./PartnersLanding";

// With the Lana Pro cutover on, "Become a Partner" goes straight into
// /lana-pro/onboarding — its own welcome + professional/business branch
// selector replaces this marketing chooser. The classic marketing page only
// renders when the cutover is off.
export default function PartnersSignupEntry() {
  if (isLanaProEnabled()) {
    redirect(LANA_PRO_ONBOARDING);
  }
  return <PartnersLanding />;
}
