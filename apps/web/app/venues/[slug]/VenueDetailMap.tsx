"use client";

import { useEffect, useState } from "react";
import { APIProvider, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { supabase } from "../../lib/supabase";

const NAIROBI = { lat: -1.286389, lng: 36.817223 };

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { stylers: [{ saturation: -100 }, { lightness: 10 }] },
  { featureType: "road", elementType: "geometry", stylers: [{ lightness: 60 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ lightness: -10 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="39" viewBox="0 0 28 40"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.268 21.732 0 14 0z" fill="#111"/><circle cx="14" cy="14" r="5" fill="white"/></svg>`;
const PIN_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PIN_SVG)}`;

async function geocode(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`);
    const data = await res.json();
    if (data.status === "OK" && data.results[0]) return data.results[0].geometry.location;
  } catch {}
  return null;
}

type Props = { id: string; name: string; area: string; location: string; lat?: number | null; lng?: number | null };

function MapContent({ id, name, area, location, lat, lng, apiKey }: Props & { apiKey: string }) {
  const map = useMap();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null
  );
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (pos || !apiKey) return;
    const address = [location, area, "Nairobi", "Kenya"].filter(Boolean).join(", ");
    geocode(address, apiKey).then((result) => {
      if (result) {
        setPos(result);
        supabase.from("gyms").update({ lat: result.lat, lng: result.lng }).eq("id", id).then(() => {});
      }
    });
  }, []);

  useEffect(() => {
    if (map && pos) { map.panTo(pos); map.setZoom(16); }
  }, [map, pos]);

  const center = pos ?? NAIROBI;

  return (
    <>
      {pos && (
        <Marker
          position={pos}
          onClick={() => setShowInfo(true)}
          icon={{
            url: PIN_URL,
            scaledSize: new window.google.maps.Size(28, 39),
            anchor: new window.google.maps.Point(14, 39),
          }}
        />
      )}
      {pos && showInfo && (
        <InfoWindow position={pos} onCloseClick={() => setShowInfo(false)} pixelOffset={[0, -40]}>
          <div style={{ fontSize: 13 }}>
            <p style={{ fontWeight: 700, marginBottom: 2 }}>{name}</p>
            <p style={{ color: "#666" }}>{location}{area ? `, ${area}` : ""}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function VenueDetailMap(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const center = props.lat != null && props.lng != null ? { lat: props.lat, lng: props.lng } : NAIROBI;

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        style={{ height: "100%", width: "100%" }}
        defaultCenter={center}
        defaultZoom={props.lat != null ? 16 : 12}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        scrollwheel={false}
        styles={MAP_STYLES}
      >
        <MapContent {...props} apiKey={apiKey} />
      </Map>
    </APIProvider>
  );
}
