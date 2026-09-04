"use client";

import { useEffect, useState } from "react";

const SCHEMES: Record<string, string> = {
  mobile: "acitypass",
  partner: "partners",
};

export default function AppRedirectClient() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const app = new URLSearchParams(window.location.search).get("app") ?? "mobile";
    const scheme = SCHEMES[app] ?? "acitypass";
    const hash = window.location.hash;
    const link = `${scheme}://reset-password${hash}`;
    setDeepLink(link);

    window.location.href = link;

    const t = setTimeout(() => setTimedOut(true), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <img
          src="/images/logo-black.png"
          alt="Lana Health"
          className="h-8 w-auto mx-auto mb-8"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />

        {!timedOut ? (
          <>
            <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-6" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Opening app…</h1>
            <p className="text-sm text-gray-500">
              You'll be redirected to reset your password in the app.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Open the app to continue</h1>
            <p className="text-sm text-gray-500 mb-6">
              Tap the button below to open Lana Health and reset your password.
            </p>
            {deepLink && (
              <a
                href={deepLink}
                className="inline-block w-full px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-900 transition"
              >
                Open in app
              </a>
            )}
            <p className="text-xs text-gray-400 mt-4">
              Make sure the app is installed on this device.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
