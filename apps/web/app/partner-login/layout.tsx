import PartnerHeader from "../components/PartnerHeader";

export default function PartnerLoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PartnerHeader />
      <main>{children}</main>
    </>
  );
}
