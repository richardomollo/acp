import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Active CityPass",
  description: "How Active CityPass collects, uses, and protects your personal information.",
};

const LAST_UPDATED = "4 June 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <div className="bg-black text-white py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Legal</p>
          <h1 className="text-4xl font-bold mb-3">Privacy Policy</h1>
          <p className="text-white/50 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16 prose prose-gray max-w-none">

        <p className="text-gray-600 text-base leading-relaxed">
          Active CityPass ("<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>") operates the Active CityPass platform, including our website at{" "}
          <a href="https://activecitypass.com" className="text-blue-600 hover:underline">activecitypass.com</a> and our mobile application (collectively, the "<strong>Service</strong>").
          This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
        </p>

        <Section title="1. Information We Collect">
          <Subsection title="Information you provide directly">
            <ul>
              <li><strong>Account information:</strong> name, email address, phone number, and password when you register.</li>
              <li><strong>Profile information:</strong> profile photo and fitness preferences you choose to add.</li>
              <li><strong>Payment information:</strong> billing details processed via our payment providers (M-Pesa, Stripe). We do not store full card numbers or M-Pesa PINs.</li>
              <li><strong>Communications:</strong> messages you send us via email or support channels.</li>
            </ul>
          </Subsection>
          <Subsection title="Information collected automatically">
            <ul>
              <li><strong>Usage data:</strong> pages visited, sessions booked, features used, and timestamps.</li>
              <li><strong>Device information:</strong> device type, operating system, browser type, and IP address.</li>
              <li><strong>Location:</strong> approximate location derived from IP address to surface nearby venues. We do not track your precise GPS location in the background.</li>
            </ul>
          </Subsection>
          <Subsection title="Information from third parties">
            <ul>
              <li><strong>Google Sign-In:</strong> if you sign in with Google, we receive your name, email address, and profile picture from Google.</li>
              <li><strong>Partner venues:</strong> attendance and check-in records provided by partner venues when you attend sessions.</li>
            </ul>
          </Subsection>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>We use the information we collect to:</p>
          <ul>
            <li>Create and manage your account.</li>
            <li>Process bookings and payments.</li>
            <li>Send booking confirmations, receipts, and service-related notifications.</li>
            <li>Send marketing communications (only with your consent; you may opt out at any time).</li>
            <li>Personalise venue and session recommendations.</li>
            <li>Improve the Service through analytics and feedback.</li>
            <li>Comply with legal obligations and enforce our Terms &amp; Conditions.</li>
            <li>Detect, prevent, and respond to fraud or security incidents.</li>
          </ul>
        </Section>

        <Section title="3. Sharing Your Information">
          <p>We do not sell your personal information. We share it only in these circumstances:</p>
          <ul>
            <li><strong>Partner venues:</strong> we share your name and booking details with the venue hosting your session so they can manage attendance.</li>
            <li><strong>Service providers:</strong> we use trusted third-party providers including Supabase (database &amp; authentication), Stripe and M-Pesa (payments), and Expo/Apple/Google (mobile app delivery). These providers process data only on our behalf under data processing agreements.</li>
            <li><strong>Legal requirements:</strong> we may disclose your information where required by law, regulation, court order, or to protect the rights and safety of Active CityPass, our users, or others.</li>
            <li><strong>Business transfers:</strong> in the event of a merger, acquisition, or sale of assets, your information may be transferred. We will notify you before your data becomes subject to a different privacy policy.</li>
          </ul>
        </Section>

        <Section title="4. Data Retention">
          <p>
            We retain your personal data for as long as your account is active or as needed to provide the Service. You may request deletion of your account and associated data at any time (see Section 6). We may retain certain records for up to 7 years where required by Kenyan tax or financial regulation.
          </p>
        </Section>

        <Section title="5. Security">
          <p>
            We implement industry-standard technical and organisational measures to protect your information, including encrypted data storage (Supabase with row-level security), HTTPS for all data in transit, and access controls. No method of transmission over the internet is 100% secure; we cannot guarantee absolute security but commit to promptly notifying you of any confirmed breach affecting your data.
          </p>
        </Section>

        <Section title="6. Your Rights">
          <p>Under applicable data protection law you have the right to:</p>
          <ul>
            <li><strong>Access</strong> the personal data we hold about you.</li>
            <li><strong>Correct</strong> inaccurate or incomplete data — you can update most information directly in the app under Profile &gt; Account Details.</li>
            <li><strong>Delete</strong> your account and personal data — use the "Delete Account" option in the app or email us at <a href="mailto:privacy@activecitypass.com" className="text-blue-600 hover:underline">privacy@activecitypass.com</a>.</li>
            <li><strong>Object</strong> to or restrict processing, including opting out of marketing emails via the unsubscribe link in any email.</li>
            <li><strong>Data portability</strong> — request a copy of your data in a machine-readable format.</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href="mailto:privacy@activecitypass.com" className="text-blue-600 hover:underline">privacy@activecitypass.com</a>. We will respond within 30 days.</p>
        </Section>

        <Section title="7. Cookies">
          <p>
            Our website uses essential cookies required for authentication and security. We do not currently use tracking or advertising cookies. You can control cookie settings in your browser; disabling essential cookies may prevent you from logging in.
          </p>
        </Section>

        <Section title="8. Children's Privacy">
          <p>
            The Service is not directed at children under the age of 18. We do not knowingly collect personal information from children. If you believe a child has provided us with personal data, please contact us and we will delete it promptly.
          </p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes by posting a notice in the app or sending an email before the changes take effect. Continued use of the Service after the effective date constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="10. Contact Us">
          <p>If you have questions, concerns, or requests regarding this Privacy Policy, please contact us:</p>
          <address className="not-italic text-gray-700 mt-3 space-y-1">
            <p><strong>Active CityPass</strong></p>
            <p>Nairobi, Kenya</p>
            <p>Email: <a href="mailto:privacy@activecitypass.com" className="text-blue-600 hover:underline">privacy@activecitypass.com</a></p>
            <p>General: <a href="mailto:info@activecitypass.com" className="text-blue-600 hover:underline">info@activecitypass.com</a></p>
          </address>
        </Section>

        {/* Back link */}
        <div className="mt-16 pt-8 border-t border-gray-100">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{title}</h2>
      <div className="text-gray-600 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-2">{title}</h3>
      <div className="text-gray-600 text-sm leading-relaxed">{children}</div>
    </div>
  );
}
