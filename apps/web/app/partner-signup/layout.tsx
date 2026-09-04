import type { Metadata } from "next";
import PartnerHeader from "../components/PartnerHeader";

export const metadata: Metadata = {
  title: "Partner Application",
  description:
    "Apply to list your sports or wellness venue on Lana Health. Takes 5 minutes and there are no upfront fees.",
  robots: { index: false, follow: false },
};

export default function PartnerSignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PartnerHeader />
      {children}
    </>
  );
}
