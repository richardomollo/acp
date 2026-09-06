import { redirect } from "next/navigation";
import { isLanaProEnabled, LANA_PRO_HOME } from "@/lib/lana-pro-flags";
import PartnerDashboardHomeClient from "./PartnerDashboardHomeClient";

// The classic venue dashboard is replaced by the Lana Pro workspace (business
// variant). The route stays mounted for backward compatibility; `?classic=1`
// renders this legacy home directly. Only the bare index redirects, and only
// while the cutover flag is on.
export default async function PartnerDashboardIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  if (isLanaProEnabled() && sp?.classic !== "1") {
    redirect(LANA_PRO_HOME);
  }
  return <PartnerDashboardHomeClient />;
}
