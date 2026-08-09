"use client";

import dynamic from "next/dynamic";

const VenueDetailMap = dynamic(() => import("./VenueDetailMap"), { ssr: false });

type Props = {
  id: string;
  name: string;
  area: string;
  location: string;
  lat?: number | null;
  lng?: number | null;
};

export default function VenueDetailMapWrapper(props: Props) {
  return <VenueDetailMap {...props} />;
}
