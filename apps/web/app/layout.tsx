import type { Metadata } from "next";
import "./globals.css";
import { sfPro } from "./fonts";
import ConditionalLayout from "./components/ConditionalLayout";
import SessionSync from "./components/SessionSync";

export const metadata: Metadata = {
  metadataBase: new URL("https://activecitypass.com"),
  title: {
    default: "Lana Health – Sports, Fitness & Wellness in Nairobi",
    template: "%s | Lana Health",
  },
  description:
    "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi. No contracts.",
  keywords: [
    "Nairobi gym",
    "fitness pass Nairobi",
    "yoga Nairobi",
    "wellness Nairobi",
    "Lana Health",
    "sports Nairobi",
    "pilates Nairobi",
    "swimming Nairobi",
  ],
  openGraph: {
    siteName: "Lana Health",
    type: "website",
    locale: "en_KE",
    url: "https://activecitypass.com",
    title: "Lana Health – Sports, Fitness & Wellness in Nairobi",
    description:
      "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi. No contracts.",
    images: [{ url: "/images/og-default.jpg", width: 1200, height: 630, alt: "Lana Health" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lana Health – Sports, Fitness & Wellness in Nairobi",
    description:
      "One pass, 50+ venues. Book gyms, yoga, pilates, swimming, spas and more across Nairobi.",
    images: ["/images/og-default.jpg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={sfPro.variable}>
      <body className="min-h-screen flex flex-col">
        <SessionSync />
        <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>    
  );
}

