import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Get started · Lana Pro",
  robots: { index: false, follow: false },
};

// The onboarding flow renders its own full-viewport shell (header, progress,
// footer). The marketing site chrome is suppressed for this path via
// ConditionalLayout's HIDE_CHROME_PREFIX.
export default function LanaProOnboardingLayout({ children }: { children: ReactNode }) {
  return children;
}
