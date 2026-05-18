"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const AREA_COORDS: Record<string, [number, number]> = {
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
  "Ngong Road":   [-1.3050, 36.7700],
  "South B":      [-1.3100, 36.8400],
  "Eastlands":    [-1.2800, 36.8700],
  "Riverside":    [-1.2740, 36.7980],
  "Spring Valley":[-1.2580, 36.7820],
  "Ruaka":        [-1.2050, 36.7700],
  "Embakasi":     [-1.3186, 36.8986],
  "Diamond Plaza, Fourth Parklands Ave": [-1.2578, 36.8221],
  "Gigiri Nairobi, Kenya.":              [-1.2340, 36.7993],
  "Junction Mall":                        [-1.2980, 36.7730],
  "South Field Mall":                     [-1.3370, 36.8560],
};

const NAIROBI: [number, number] = [-1.286389, 36.817223];

type Props = {
  name: string;
  area: string;
  location: string;
};

export default function VenueDetailMap({ name, area, location }: Props) {
  useEffect(() => {
    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const coords = AREA_COORDS[area.trim()] ?? NAIROBI;

  const icon = L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="39" viewBox="0 0 28 40">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.268 21.732 0 14 0z" fill="#111"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
    </svg>`,
    className: "",
    iconSize: [28, 39],
    iconAnchor: [14, 39],
    popupAnchor: [0, -40],
  });

  return (
    <MapContainer
      center={coords}
      zoom={15}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <Marker position={coords} icon={icon}>
        <Popup>
          <div style={{ fontSize: 13 }}>
            <p style={{ fontWeight: 700, marginBottom: 2 }}>{name}</p>
            <p style={{ color: "#666" }}>{location}, {area}</p>
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
