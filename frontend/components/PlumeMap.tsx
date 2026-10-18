"use client";

import L from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { SEVERITY_HEX } from "@/lib/format";
import { LOCATION_PRECISION_KM, type Plume } from "@/lib/plumes";

/** Smallest a footprint may draw, so a zoomed-out cell stays clickable. */
const MIN_CELL_PX = 11;
/** Largest, so a deep zoom does not flood the viewport with one cell. */
const MAX_CELL_PX = 150;

/**
 * How many screen pixels one TROPOMI footprint spans here.
 *
 * Web Mercator resolution is 156543.03 m/px at zoom 0 on the equator, halving
 * each zoom level and narrowing with latitude. Below MIN_CELL_PX the cell is
 * clamped - at world zoom a true 7 km square would be sub-pixel - so cells read
 * as uniform markers when zoomed out and resolve to true scale as you zoom in.
 */
function cellPx(zoom: number, lat: number): number {
  const metresPerPx =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  const px = (LOCATION_PRECISION_KM * 1000) / metresPerPx;
  return Math.round(Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, px)));
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function buildIcon(plume: Plume, zoom: number, selected: boolean): L.DivIcon {
  const size = cellPx(zoom, plume.lat);
  const hex = SEVERITY_HEX[plume.severity];

  // One ring per extra week the spot reoffended, capped so the map stays legible.
  const weeksSeen = plume.weeklyHistory.filter((n) => n > 0).length;
  const rings = Math.min(3, Math.max(0, weeksSeen - 1));
  const ringHtml = Array.from({ length: rings }, (_, i) => {
    const inset = -(4 + i * 4);
    return `<i class="cell-repeat" style="inset:${inset}px;opacity:${0.5 - i * 0.12}"></i>`;
  }).join("");

  // West-to-east reveal, mirroring the direction a polar orbiter paints a swath.
  const delay = Math.round(((plume.lon + 180) / 360) * 700);

  return L.divIcon({
    className: "", // leaflet's default div-icon chrome is cleared in globals.css
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="cell-marker${selected ? " cell-selected" : ""}" style="
        --cell-tint:${withAlpha(hex, 0.55)};
        --cell-edge:${hex};
        --cell-glow:${withAlpha(hex, 0.45)};
        animation-delay:${delay}ms">
        <span class="cell" style="width:${size}px;height:${size}px">${ringHtml}</span>
      </div>`,
  });
}

function Cells({
  plumes,
  selectedId,
  onSelect,
}: {
  plumes: Plume[];
  selectedId: string | null;
  onSelect: (p: Plume) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  // Cells are re-iconed on zoom so they track their true ground footprint.
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  return (
    <>
      {plumes.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lon]}
          icon={buildIcon(p, zoom, p.id === selectedId)}
          eventHandlers={{ click: () => onSelect(p) }}
          keyboard
          alt={`${p.severity} methane plume, ${p.rate} tonnes per hour, ${p.country}`}
        />
      ))}
    </>
  );
}

/** Pans to the selected plume when it is chosen from the list. */
function FlyTo({ target }: { target: Plume | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 6), {
      duration: 0.8,
    });
  }, [target, map]);
  return null;
}

export default function PlumeMap({
  plumes,
  selected,
  flyTarget,
  onSelect,
}: {
  plumes: Plume[];
  selected: Plume | null;
  flyTarget: Plume | null;
  onSelect: (p: Plume) => void;
}) {
  return (
    <MapContainer
      center={[26, 24]}
      zoom={2}
      minZoom={2}
      maxZoom={10}
      worldCopyJump
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      {/*
        Esri's dark canvas: keyless, label-free and low-contrast, so the plume
        cells are the only saturated thing on the page.
      */}
      <TileLayer
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='Basemap &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors &middot; plumes: SRON / CAMS'
        maxZoom={10}
      />
      <Cells
        plumes={plumes}
        selectedId={selected?.id ?? null}
        onSelect={onSelect}
      />
      <FlyTo target={flyTarget} />
    </MapContainer>
  );
}
