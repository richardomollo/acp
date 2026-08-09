import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Active CityPass – Your Nairobi Fitness & Wellness Pass",
  description:
    "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi. Start your 14-day free trial today — no contracts.",
  openGraph: {
    title: "Active CityPass – Your Nairobi Fitness & Wellness Pass",
    description:
      "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi. Start your 14-day free trial today.",
    url: "https://activecitypass.com",
    images: [{ url: "/images/og-default.jpg", width: 1200, height: 630, alt: "Active CityPass" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Active CityPass – Your Nairobi Fitness & Wellness Pass",
    description:
      "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi.",
    images: ["/images/og-default.jpg"],
  },
};

export default function WalkthroughLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
