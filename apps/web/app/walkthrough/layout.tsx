import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lana – Your Nairobi Fitness & Wellness Coach",
  description:
    "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi. Start your 14-day free trial today — no contracts.",
  openGraph: {
    title: "Lana – Your Nairobi Fitness & Wellness Coach",
    description:
      "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi. Start your 14-day free trial today.",
    url: "https://activecitypass.com",
    images: [{ url: "/images/og-default.jpg", width: 1200, height: 630, alt: "Lana" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lana – Your Nairobi Fitness & Wellness Coach",
    description:
      "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi.",
    images: ["/images/og-default.jpg"],
  },
};

export default function WalkthroughLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
