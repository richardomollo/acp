"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";

const HIDE_CHROME_EXACT = ["/partners/signup", "/partner-signup", "/partner-onboarding", "/partner-login", "/partner-dashboard", "/reset-password", "/trainer-signup"];
const HIDE_CHROME_PREFIX = ["/pt-dashboard", "/pt-pending", "/trainer-dashboard"];

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideChrome =
    HIDE_CHROME_EXACT.includes(pathname) ||
    HIDE_CHROME_PREFIX.some((p) => pathname.startsWith(p));

  return (
    <>
      {!hideChrome && <Header />}
      <main className="flex-1">{children}</main>
      {!hideChrome && <Footer />}
    </>
  );
}
