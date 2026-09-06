import { resolveWorkspaceIdentity } from "../../_shared/identity";
import { SectionStub } from "../_SectionStub";

export const dynamic = "force-dynamic";

export default async function LanaProProfilePage() {
  const identity = await resolveWorkspaceIdentity();
  const gated = identity?.capabilities.marketplaceGated ?? true;
  return (
    <SectionStub
      title="Profile"
      description="How you appear to clients on Lana — your bio, specialisms, photos and areas."
      classic={gated ? null : { label: "Open classic profile", href: "/pt-dashboard/profile" }}
    />
  );
}
