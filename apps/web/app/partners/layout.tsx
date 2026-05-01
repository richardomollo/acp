import PartnerHeader from "../components/PartnerHeader";

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PartnerHeader />
      <main>{children}</main>
    </>
  );
}
