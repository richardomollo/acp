"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";

// Fix default Leaflet icon broken by webpack
const fixIcon = () => {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
};

const NAIROBI_AREA_COORDS: Record<string, [number, number]> = {
  "Westlands":    [-1.2664, 36.8022],
  "Karen":        [-1.3217, 36.6853],
  "Kilimani":     [-1.2921, 36.7921],
  "Lavington":    [-1.2782, 36.7726],
  "CBD":          [-1.2864, 36.8172],
  "Upper Hill":   [-1.2996, 36.8158],
  "Upperhill":    [-1.2996, 36.8158],
  "Parklands":    [-1.2622, 36.8178],
  "Gigiri":       [-1.2340, 36.7993],
  "Runda":        [-1.2175, 36.7915],
  "Muthaiga":     [-1.2523, 36.8278],
  "South C":      [-1.3188, 36.8311],
  "Lang'ata":     [-1.3374, 36.7295],
  "Langata":      [-1.3374, 36.7295],
  "Kileleshwa":   [-1.2800, 36.7700],
  "Hurlingham":   [-1.3000, 36.7900],
  "Thika Road":   [-1.2100, 36.8500],
  "Eastlands":    [-1.2800, 36.8700],
  "Ngong Road":   [-1.3050, 36.7700],
  "Riverside":    [-1.2740, 36.7980],
  "Spring Valley":[-1.2580, 36.7820],
  "Loresho":      [-1.2460, 36.7690],
  "Runda":        [-1.2175, 36.7915],
  "Ruaka":        [-1.2050, 36.7700],
  "Mlolongo":     [-1.3850, 36.9050],
  "Rongai":       [-1.3950, 36.7450],
  "Kikuyu":       [-1.2500, 36.6700],
  "Thika":        [-1.0400, 37.0900],
  "Embakasi":     [-1.3186, 36.8986],
  "Donholm":      [-1.2981, 36.9025],
  "South B":      [-1.3100, 36.8400],
  // Exact DB values
  "Diamond Plaza, Fourth Parklands Ave": [-1.2578, 36.8221],
  "Gigiri Nairobi, Kenya.":              [-1.2340, 36.7993],
  "Junction Mall":                        [-1.2980, 36.7730],
  "South Field Mall":                     [-1.3370, 36.8560],
};

function getCoords(area: string): [number, number] | null {
  const normalized = area.trim();
  return NAIROBI_AREA_COORDS[normalized] ?? null;
}

function FlyToActive({ activeId, gyms }: { activeId: string | null; gyms: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (!activeId) return;
    const gym = gyms.find((g) => g.id === activeId);
    if (!gym) return;
    const coords = getCoords(gym.area);
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return;
    try {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;
      map.flyTo(coords, 15, { duration: 0.8 });
    } catch (_) {}
  }, [activeId, gyms, map]);
  return null;
}

type Gym = {
  id: string;
  name: string;
  area: string;
  location: string;
  type: string;
  description: string;
  image_url: string | null;
  rating: number;
};

type Props = {
  gyms: Gym[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export default function VenuesMap({ gyms, activeId, onSelect }: Props) {
  useEffect(() => { fixIcon(); }, []);

  const NAIROBI: [number, number] = [-1.286389, 36.817223];

  return (
    <MapContainer
      center={NAIROBI}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <FlyToActive activeId={activeId} gyms={gyms} />
      {gyms.map((gym) => {
        const coords = getCoords(gym.area);
        if (!coords) return null;
        const isActive = gym.id === activeId;

        const size = isActive ? 36 : 28;
        const icon = L.divIcon({
          html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.4}" viewBox="0 0 28 40">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.268 21.732 0 14 0z"
              fill="${isActive ? "#000" : "#111"}"
              opacity="${isActive ? "1" : "0.75"}"
            />
            <circle cx="14" cy="14" r="5" fill="white"/>
          </svg>`,
          className: "",
          iconSize: [size, size * 1.4],
          iconAnchor: [size / 2, size * 1.4],
          popupAnchor: [0, -(size * 1.4)],
        });

        return (
          <Marker
            key={gym.id}
            position={coords}
            icon={icon}
            eventHandlers={{ click: () => onSelect(gym.id) }}
          >
            <Popup minWidth={220} maxWidth={240} className="venue-popup">
              <div style={{ fontFamily: "inherit", width: 220 }}>
                {gym.image_url && (
                  <img
                    src={gym.image_url}
                    alt={gym.name}
                    style={{ width: "100%", height: 120, objectFit: "cover", display: "block", borderRadius: "6px 6px 0 0", marginBottom: 10 }}
                  />
                )}
                <div style={{ padding: "0 4px 4px" }}>
                  <p style={{ fontSize: 12, color: "#888", textTransform: "capitalize", marginBottom: 2 }}>{gym.type}</p>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, lineHeight: 1.3 }}>{gym.name}</p>
                  <p style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>{gym.location}, {gym.area}</p>
                  {gym.rating > 0 && (
                    <p style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                      <span style={{ color: "#f59e0b" }}>★</span> {gym.rating}
                    </p>
                  )}
                  <a
                    href={`/venues/${gym.id}`}
                    style={{ fontSize: 13, color: "#050040", fontWeight: 600, textDecoration: "none" }}
                  >
                    View venue →
                  </a>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
