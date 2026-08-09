import Link from "next/link";
import AppStoreBadge from "./AppStoreBadge";

const CUSTOMER_APP_STORE_URL = "https://apps.apple.com/nl/app/active-urban-pass/id6767222212?l=en-GB";

const FOOTER_COLS = [
  {
    title: "Explore",
    links: [
      { label: "Classes & Sessions", href: "/sessions" },
      { label: "Venues", href: "/venues" },
      { label: "How it works", href: "/walkthrough" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/" },
      { label: "Press", href: "/" },
      { label: "Contact us", href: "mailto:info@activecitypass.com" },
      { label: "Careers", href: "/" },
      { label: "Gift Cards", href: "/" },
    ],
  },
  {
    title: "Partners",
    links: [
      { label: "Become a partner", href: "/partners/signup", target: "_blank" },
      { label: "Partner login", href: "/partner-login" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help centre", href: "/" },
      { label: "FAQ", href: "/" },
    ],
  },
];

const SOCIAL = [
  {
    label: "Instagram",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    label: "X",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "LinkedIn",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "Facebook",
    path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  },
];

export default function Footer() {
  return (
    <footer className="bg-black pt-16 pb-10">
      <div className="max-w-7xl mx-auto px-6">

        {/* Top row */}
        <div className="flex flex-col lg:flex-row justify-between gap-12 mb-14">

          {/* Brand */}
          <div className="lg:max-w-xs">
            <img src="/images/logo-white.png" alt="Active CityPass" className="h-8 w-auto mb-5" />
            <p className="text-white/40 text-sm leading-relaxed">
              Nairobi's most flexible sports &amp; wellness membership. One pass, 50+ venues, unlimited possibilities.
            </p>
            <div className="mt-6">
              <AppStoreBadge href={CUSTOMER_APP_STORE_URL} variant="light" />
            </div>
            <div className="flex gap-4 mt-6">
              {SOCIAL.map((s) => (
                <a key={s.label} href="#" aria-label={s.label} className="text-white/40 hover:text-white/80 transition-colors">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <p className="text-white/30 text-xs font-bold uppercase tracking-widest mb-4">{col.title}</p>
                <div className="flex flex-col gap-3">
                  {col.links.map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      target={(link as any).target}
                      rel={(link as any).target === "_blank" ? "noopener noreferrer" : undefined}
                      className="text-white/60 text-sm hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-white/30 text-xs">© 2026 Active CityPass. All rights reserved.</p>
          <div className="flex gap-6 text-white/30 text-xs">
            <Link href="/" className="hover:text-white/60 transition-colors">Terms &amp; Conditions</Link>
            <Link href="/privacy-policy" className="hover:text-white/60 transition-colors">Privacy</Link>
            <Link href="/" className="hover:text-white/60 transition-colors">Imprint</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
