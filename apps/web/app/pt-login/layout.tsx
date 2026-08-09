import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Personal Trainer Login – Active CityPass",
  description:
    "Sign in to your personal trainer dashboard to manage bookings, offerings, and earnings.",
  robots: { index: false, follow: false },
};

export default function PTLoginLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
