import type { Metadata } from "next";
import PartnerHeader from "../components/PartnerHeader";

export const metadata: Metadata = {
  title: "Partner Login",
  description: "Sign in to your Lana Health partner dashboard to manage sessions and view earnings.",
  robots: { index: false, follow: false },
};

export default function PartnerLoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PartnerHeader />
      <main>{children}</main>
    </>
  );
}
