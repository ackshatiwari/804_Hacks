"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getJSON, type Plume, type PlumesResponse } from "@/lib/api";
import AlertSignup from "./AlertSignup";
import PlumeDetail from "./PlumeDetail";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const DEFAULT_MIN_CONFIDENCE = 0.8;

// MapLibre 6 looks for its worker next to its own module, which the bundler doesn't emit;
// the postinstall script copies it into public/ instead.
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

function toGeoJSON(plumes: Plume[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: plumes.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id, prob: p.prob, repeat: p.repeat_count >= 2 },
    })),
  };
}

const radius = (scale: number): maplibregl.ExpressionSpecification => [
  "interpolate", ["linear"], ["zoom"],
  1, ["*", scale, ["interpolate", ["linear"], ["get", "prob"], 0.5, 2.5, 1, 5]],
  6, ["*", scale, ["interpolate", ["linear"], ["get", "prob"], 0.5, 5, 1, 10]],
];
const color: maplibregl.ExpressionSpecification = ["case", ["get", "repeat"], "#fb923c", "#fcd34d"];

/** A circle of `miles` around [lon, lat] as a polygon, for the alert area. */
function circle(center: [number, number] | null, miles: number): GeoJSON.FeatureCollection {
  if (!center) return { type: "FeatureCollection", features: [] };
  const [lon, lat] = center.map((d) => (d * Math.PI) / 180);
  const d = miles / 3958.8; // angular distance on a sphere with Earth's radius in miles
  const ring = Array.from({ length: 65 }, (_, i) => {
    const b = (i / 64) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b));
    const lon2 = lon + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(lat2));
    return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  });
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} },
      { type: "Feature", geometry: { type: "Point", coordinates: center }, properties: {} },
    ],
  };
}

export default function PlumeMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<PlumesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minConfidence, setMinConfidence] = useState(DEFAULT_MIN_CONFIDENCE);
  const [repeatsOnly, setRepeatsOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPoint, setAlertPoint] = useState<[number, number] | null>(null);
  const [alertRadius, setAlertRadius] = useState(100);
  const alertOpenRef = useRef(false);

  useEffect(() => {
    getJSON<PlumesResponse>("/api/plumes?days=7")
      .then((d) => {
        setData(d);
        // Links in alert emails open /map?plume=<id>
        const linked = d.plumes.find((p) => p.id === new URLSearchParams(window.location.search).get("plume"));
        if (linked) {
          setSelectedId(linked.id);
          map.current?.flyTo({ center: [linked.lon, linked.lat], zoom: 5 });
        }
      })
      .catch(() => setError("Couldn't reach the Methane Watch API. Is the backend running on port 8000?"));
  }, []);

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: STYLE_URL,
      center: [40, 30],
      zoom: 1.6,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.on("load", () => {
      m.addSource("alert-area", { type: "geojson", data: circle(null, 0) });
      m.addLayer({
        id: "alert-fill",
        type: "fill",
        source: "alert-area",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#38bdf8", "fill-opacity": 0.08 },
      });
      m.addLayer({
        id: "alert-line",
        type: "line",
        source: "alert-area",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-dasharray": [2, 2] },
      });
      m.addLayer({
        id: "alert-center",
        type: "circle",
        source: "alert-area",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 4, "circle-color": "#38bdf8", "circle-stroke-width": 2, "circle-stroke-color": "#09090b" },
      });
      m.addSource("plumes", { type: "geojson", data: toGeoJSON([]) });
      m.addLayer({
        id: "plume-glow",
        type: "circle",
        source: "plumes",
        paint: { "circle-radius": radius(2.6), "circle-color": color, "circle-blur": 1, "circle-opacity": 0.45 },
      });
      m.addLayer({
        id: "plume-ring",
        type: "circle",
        source: "plumes",
        filter: ["get", "repeat"],
        paint: {
          "circle-radius": radius(1.9),
          "circle-color": "transparent",
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(251, 146, 60, 0.6)",
        },
      });
      m.addLayer({
        id: "plume-dot",
        type: "circle",
        source: "plumes",
        paint: { "circle-radius": radius(1), "circle-color": color },
      });
      m.addLayer({
        id: "plume-selected",
        type: "circle",
        source: "plumes",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": radius(1.6),
          "circle-color": "transparent",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fafafa",
        },
      });
      m.on("click", "plume-dot", (e) => setSelectedId(e.features?.[0]?.properties.id ?? null));
      m.on("click", (e) => {
        if (!alertOpenRef.current || m.queryRenderedFeatures(e.point, { layers: ["plume-dot"] }).length) return;
        setAlertPoint([e.lngLat.lng, e.lngLat.lat]);
      });
      m.on("mouseenter", "plume-dot", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "plume-dot", () => (m.getCanvas().style.cursor = ""));
      setLoaded(true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      setLoaded(false);
    };
  }, []);

  const visible = useMemo(
    () => (data?.plumes ?? []).filter((p) => p.prob >= minConfidence && (!repeatsOnly || p.repeat_count >= 2)),
    [data, minConfidence, repeatsOnly],
  );
  const selected = data?.plumes.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!loaded || !map.current) return;
    map.current.getSource<maplibregl.GeoJSONSource>("plumes")?.setData(toGeoJSON(visible));
  }, [loaded, visible]);

  useEffect(() => {
    if (!loaded || !map.current) return;
    map.current.setFilter("plume-selected", ["==", ["get", "id"], selectedId ?? ""]);
  }, [loaded, selectedId]);

  useEffect(() => {
    alertOpenRef.current = alertOpen;
    if (!loaded || !map.current) return;
    map.current.getSource<maplibregl.GeoJSONSource>("alert-area")?.setData(circle(alertOpen ? alertPoint : null, alertRadius));
    map.current.getCanvas().style.cursor = alertOpen ? "crosshair" : "";
  }, [loaded, alertOpen, alertPoint, alertRadius]);

  function openAlerts() {
    const c = map.current?.getCenter();
    setAlertPoint((p) => p ?? (c ? [c.lng, c.lat] : null));
    setAlertOpen(true);
  }

  const threshold = data?.threshold ?? 0.5;
  const repeatCount = visible.filter((p) => p.repeat_count >= 2).length;

  return (
    <div className="relative flex-1">
      {/* maplibre-gl.css sets position: relative on the container, so size it from a wrapper */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>

      <div className="absolute left-3 top-3 w-72 rounded-xl border border-white/10 bg-zinc-950/90 p-4 text-sm shadow-xl shadow-black/50 backdrop-blur">
        <h1 className="font-semibold text-zinc-100">This week&apos;s plumes</h1>
        <p className="mt-1 text-xs text-zinc-500">
          {data?.start ? `${data.start} to ${data.end} · Sentinel-5P` : error ? "No data" : "Loading…"}
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
        {data && !data.end && (
          <p className="mt-3 text-xs text-zinc-400">
            No scans yet. Run <code className="text-amber-300">backend/scripts/run_scan.py</code>.
          </p>
        )}

        <div className="mt-4 flex gap-6">
          <div>
            <div className="font-mono text-2xl font-semibold text-amber-300">{visible.length}</div>
            <div className="text-xs text-zinc-500">plumes shown</div>
          </div>
          <div>
            <div className="font-mono text-2xl font-semibold text-orange-400">{repeatCount}</div>
            <div className="text-xs text-zinc-500">repeat spots</div>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="flex justify-between text-xs text-zinc-400">
            <span>Min. model confidence</span>
            <span className="font-mono text-zinc-200">{Math.round(minConfidence * 100)}%</span>
          </span>
          <input
            type="range"
            min={Math.floor(threshold * 100) / 100}
            max={0.99}
            step={0.01}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="mt-2 w-full accent-amber-400"
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={repeatsOnly}
            onChange={(e) => setRepeatsOnly(e.target.checked)}
            className="accent-orange-400"
          />
          Only spots seen on 2+ days in 8 weeks
        </label>

        <div className="mt-4 flex items-center gap-4 border-t border-white/5 pt-3 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-300" /> Single sighting
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-400 ring-2 ring-orange-400/30" /> Repeat spot
          </span>
        </div>

        {alertOpen ? (
          <AlertSignup
            point={alertPoint}
            radiusMiles={alertRadius}
            onRadiusChange={setAlertRadius}
            onClose={() => setAlertOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={openAlerts}
            className="mt-4 h-8 w-full rounded-full border border-white/10 text-xs font-medium text-zinc-200 transition-colors hover:border-sky-400/50 hover:text-sky-300"
          >
            Email me about plumes near a place
          </button>
        )}
      </div>

      {selected && (
        <div className="absolute bottom-3 right-3 top-3 w-80 max-sm:left-3 max-sm:top-auto">
          <PlumeDetail plume={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}
