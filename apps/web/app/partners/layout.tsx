import type { Metadata } from "next";
import PartnerHeader from "../components/PartnerHeader";

export const metadata: Metadata = {
  title: "Partner with Lana Health",
  description:
    "List your gym, yoga studio, pool or wellness venue on Lana Health and reach thousands of Nairobi's most active members. No upfront fees, no long-term contract.",
  openGraph: {
    title: "Partner with Lana Health – Grow Your Fitness Business",
    description:
      "Reach thousands of active Nairobians, fill empty slots, and earn more. Listing is free.",
    url: "https://activecitypass.com/partners/signup",
  },
};

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PartnerHeader />
      <main>{children}</main>
    </>
  );
}
