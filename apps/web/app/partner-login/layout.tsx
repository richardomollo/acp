import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in · Lana Pro",
  description: "Sign in to your Lana Pro workspace to manage clients, bookings and your business.",
  robots: { index: false, follow: false },
};

export default function PartnerLoginLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
