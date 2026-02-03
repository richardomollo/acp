import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Active CityPass Nairobi – Sports, Fitness & Wellness for Everyone",
  description: "Access fitness, your wayFrom solo workouts to family fun, Active CityPass unlocks 50+ sports and wellness activities across Nairobi — anytime, anywhere",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Header />
          <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>    
  );
}


         //<main className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          