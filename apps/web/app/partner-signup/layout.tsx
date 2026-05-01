import PartnerHeader from "../components/PartnerHeader";

export default function PartnerSignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PartnerHeader />
      <main>{children}</main>
    </>
  );
}
