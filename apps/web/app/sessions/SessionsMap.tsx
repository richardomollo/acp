"use client";

import { useEffect, useRef, useState } from "react";
import { APIProvider, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { supabase } from "../lib/supabase";

const NAIROBI = { lat: -1.286389, lng: 36.817223 };

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { stylers: [{ saturation: -100 }, { lightness: 10 }] },
  { featureType: "road", elementType: "geometry", stylers: [{ lightness: 60 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ lightness: -10 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

async function geocode(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`);
    const data = await res.json();
    if (data.status === "OK" && data.results[0]) return data.results[0].geometry.location;
  } catch {}
  return null;
}

const pinUrl = (active: boolean) => {
  const color = active ? "#000000" : "#374151";
  const size = active ? 36 : 28;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.4}" viewBox="0 0 28 40"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.268 21.732 0 14 0z" fill="${color}" opacity="${active ? 1 : 0.8}"/><circle cx="14" cy="14" r="5" fill="white"/></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, size };
};

export type MapGym = {
  id: string;
  slug?: string | null;
  name: string;
  area: string;
  location: string;
  type?: string;
  image_url?: string | null;
  sessionCount?: number;
  lat?: number | null;
  lng?: number | null;
};

type Props = { gyms: MapGym[]; activeId: string | null; onSelect: (id: string) => void };

function MapContent({ gyms, geocoded, activeId, onSelect }: {
  gyms: MapGym[];
  geocoded: Record<string, { lat: number; lng: number }>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();

  const getPos = (gym: MapGym) => {
    if (gym.lat != null && gym.lng != null) return { lat: gym.lat, lng: gym.lng };
    return geocoded[gym.id] ?? null;
  };

  useEffect(() => {
    if (!map || !activeId) return;
    const gym = gyms.find((g) => g.id === activeId);
    if (!gym) return;
    const pos = getPos(gym);
    if (pos) map.panTo(pos);
  }, [activeId, map]);

  const activeGym = activeId ? gyms.find((g) => g.id === activeId) ?? null : null;
  const activePos = activeGym ? getPos(activeGym) : null;

  return (
    <>
      {gyms.map((gym) => {
        const pos = getPos(gym);
        if (!pos) return null;
        const isActive = gym.id === activeId;
        const { url, size } = pinUrl(isActive);
        return (
          <Marker
            key={gym.id}
            position={pos}
            onClick={() => onSelect(gym.id)}
            icon={{
              url,
              scaledSize: new window.google.maps.Size(size, size * 1.4),
              anchor: new window.google.maps.Point(size / 2, size * 1.4),
            }}
            zIndex={isActive ? 10 : 1}
          />
        );
      })}

      {activeGym && activePos && (
        <InfoWindow position={activePos} onCloseClick={() => onSelect(activeId!)} pixelOffset={[0, -42]}>
          <div style={{ fontFamily: "inherit", width: 200 }}>
            {activeGym.image_url && (
              <img src={activeGym.image_url} alt={activeGym.name}
                style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: "6px 6px 0 0", display: "block", marginBottom: 8 }} />
            )}
            {activeGym.type && <p style={{ fontSize: 11, color: "#888", textTransform: "capitalize", marginBottom: 2 }}>{activeGym.type}</p>}
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{activeGym.name}</p>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{activeGym.location}</p>
            {activeGym.sessionCount != null && (
              <p style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
                {activeGym.sessionCount} class{activeGym.sessionCount !== 1 ? "es" : ""} available
              </p>
            )}
            <a href={`/venues/${activeGym.slug ?? activeGym.id}`} style={{ fontSize: 13, color: "#050040", fontWeight: 600, textDecoration: "none" }}>View venue →</a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function SessionsMap({ gyms, activeId, onSelect }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [geocoded, setGeocoded] = useState<Record<string, { lat: number; lng: number }>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!apiKey) return;
    gyms.forEach(async (gym) => {
      if (gym.lat != null && gym.lng != null) return;
      if (pendingRef.current.has(gym.id)) return;
      pendingRef.current.add(gym.id);
      const address = [gym.location, gym.area, "Nairobi", "Kenya"].filter(Boolean).join(", ");
      const pos = await geocode(address, apiKey);
      if (pos) {
        setGeocoded((prev) => ({ ...prev, [gym.id]: pos }));
        supabase.from("gyms").update({ lat: pos.lat, lng: pos.lng }).eq("id", gym.id).then(() => {});
      }
    });
  }, [gyms, apiKey]);

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        style={{ height: "100%", width: "100%" }}
        defaultCenter={NAIROBI}
        defaultZoom={12}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        styles={MAP_STYLES}
      >
        <MapContent gyms={gyms} geocoded={geocoded} activeId={activeId} onSelect={onSelect} />
      </Map>
    </APIProvider>
  );
}
