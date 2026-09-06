import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { navItemsFor } from "@/lib/lana-pro-workspace/capabilities";
import { isLanaProVenueTeamsEnabled } from "@/lib/lana-pro-flags";
import { resolveWorkspaceIdentity } from "../_shared/identity";
import { LanaProShell } from "./LanaProShell";

export const metadata: Metadata = {
  title: { default: "Lana Pro", template: "%s · Lana Pro" },
  robots: { index: false, follow: false },
};

const ROLE_LABEL: Record<string, string> = {
  professional: "Professional",
  business: "Business",
};

export default async function LanaProWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await resolveWorkspaceIdentity();

  if (!identity) {
    redirect("/partner-login");
  }
  if (identity.capabilities.needsOnboarding) {
    redirect("/lana-pro/onboarding");
  }

  const nav = navItemsFor(identity.capabilities).filter(
    (item) => item.id !== "team" || isLanaProVenueTeamsEnabled(),
  );
  const kind = identity.activeContext?.kind;
  const roleLabel =
    kind === "business" && identity.gyms[0]?.type
      ? `${identity.gyms[0].type[0].toUpperCase()}${identity.gyms[0].type.slice(1)}`
      : kind === "employed"
        ? "Professional"
        : ROLE_LABEL[identity.capabilities.primaryRole] ?? "Lana Pro";

  return (
    <LanaProShell
      nav={nav}
      displayName={identity.displayName}
      roleLabel={roleLabel}
      contexts={identity.contexts}
      activeContextId={identity.activeContext?.id ?? null}
    >
      {children}
    </LanaProShell>
  );
}
