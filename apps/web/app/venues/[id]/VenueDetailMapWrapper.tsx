"use client";

import dynamic from "next/dynamic";

const VenueDetailMap = dynamic(() => import("./VenueDetailMap"), { ssr: false });

type Props = {
  name: string;
  area: string;
  location: string;
};

export default function VenueDetailMapWrapper(props: Props) {
  return <VenueDetailMap {...props} />;
}
