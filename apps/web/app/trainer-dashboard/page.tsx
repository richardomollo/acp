import { redirect } from "next/navigation";
import { isLanaProEnabled, LANA_PRO_HOME } from "@/lib/lana-pro-flags";
import TrainerDashboardHomeClient from "./TrainerDashboardHomeClient";

// The classic employed-trainer dashboard home is replaced by the Lana Pro
// workspace (employed-professional context). The route stays mounted for
// backward compatibility — /trainer-dashboard/* sub-pages still work, and
// `?classic=1` renders this legacy home directly. Only the bare index
// redirects, and only while the cutover flag is on.
export default async function TrainerDashboardIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  if (isLanaProEnabled() && sp?.classic !== "1") {
    redirect(LANA_PRO_HOME);
  }
  return <TrainerDashboardHomeClient />;
}
