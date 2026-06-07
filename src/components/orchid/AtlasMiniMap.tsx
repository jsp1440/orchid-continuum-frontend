/**
 * AtlasMiniMap
 * ------------
 * A small real-geography map used to embed a species/biome/pollinator
 * distribution preview anywhere on the platform (species pages, habitat
 * journeys, pollinator pages).
 *
 * INFRASTRUCTURE: this component uses Leaflet + CartoDB dark_all OSM
 * tiles for real Earth coastlines and country boundaries. There are NO
 * hand-drawn continent polygons in this file — that is a strict project
 * rule for the Orchid Continuum scientific atlas.
 */

import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Globe2, Loader2 } from 'lucide-react';
import { useLeaflet } from '@/hooks/useLeaflet';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';

export interface AtlasMiniMapProps {
  points: AtlasOccurrencePoint[];
  title?: string;
  pointColor?: string;
  /** Optional cap to limit rendered points (default 1500). */
  cap?: number;
  /** Optional secondary points (e.g. pollinator overlap) rendered as rings. */
  overlay?: AtlasOccurrencePoint[];
  overlayColor?: string;
  /** Link to the full Atlas page filtered by these points. */
  atlasHref?: string;
}

const isValidLatLng = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 &&
  lng >= -180 && lng <= 180 &&
  !(lat === 0 && lng === 0);

const AtlasMiniMap: React.FC<AtlasMiniMapProps> = ({
  points,
  title,
  pointColor = '#c9a24a',
  cap = 1500,
  overlay,
  overlayColor = '#86efac',
  atlasHref,
}) => {
  const { ready, error, L } = useLeaflet();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlayLayerRef = useRef<any>(null);

  const validPoints = points.filter((p) => isValidLatLng(p.lat, p.lng));
  const sampled =
    validPoints.length > cap
      ? validPoints.filter((_, i) => i % Math.ceil(validPoints.length / cap) === 0)
      : validPoints;
  const validOverlay = (overlay ?? []).filter((p) => isValidLatLng(p.lat, p.lng));

  // ---- Initialise map ----
  useEffect(() => {
    if (!ready || !L || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [5, 20],
      zoom: 1,
      minZoom: 1,
      maxZoom: 10,
      worldCopyJump: true,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      scrollWheelZoom: false,
      maxBounds: [[-85, -240], [85, 240]],
    });
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      overlayLayerRef.current = null;
    };
  }, [ready, L]);

  // ---- Render points ----
  useEffect(() => {
    if (!ready || !L || !mapRef.current) return;
    const map = mapRef.current;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (sampled.length === 0) return;
    const group = L.layerGroup();
    for (const p of sampled) {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 2.4,
        color: pointColor,
        weight: 0.5,
        fillColor: pointColor,
        fillOpacity: 0.7,
      });
      const name = (p.canonicalName || '').replace(/</g, '&lt;');
      const country = (p.country || '').replace(/</g, '&lt;');
      marker.bindTooltip(
        `<div style="font-family:ui-sans-serif,system-ui;color:#0d1224;background:rgba(255,255,255,0.95);padding:3px 7px;border-radius:4px;font-size:11px">
           <strong><em>${name}</em></strong>
           <div style="opacity:.7">${country}</div>
         </div>`,
        { direction: 'top', opacity: 1 },
      );
      group.addLayer(marker);
    }
    group.addTo(map);
    layerRef.current = group;

    // Fit to data when there's something to show.
    try {
      const bounds = L.latLngBounds(sampled.map((p) => [p.lat, p.lng]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 6 });
    } catch {
      // no-op
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, L, points, pointColor, cap]);

  // ---- Render overlay rings ----
  useEffect(() => {
    if (!ready || !L || !mapRef.current) return;
    const map = mapRef.current;
    if (overlayLayerRef.current) {
      map.removeLayer(overlayLayerRef.current);
      overlayLayerRef.current = null;
    }
    if (validOverlay.length === 0) return;
    const group = L.layerGroup();
    for (const p of validOverlay) {
      const ring = L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: overlayColor,
        weight: 1,
        fillOpacity: 0,
        opacity: 0.7,
        interactive: false,
      });
      group.addLayer(ring);
    }
    group.addTo(map);
    overlayLayerRef.current = group;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, L, overlay, overlayColor]);

  return (
    <div className="relative rounded-2xl border border-white/[0.08] overflow-hidden bg-[#06091a]">
      {title && (
        <div className="absolute top-3 left-3 z-[400] font-mono text-[9px] tracking-[0.26em] uppercase text-[#c9a24a]/85 bg-[#04050d]/80 backdrop-blur px-2 py-1 rounded-full border border-white/10">
          {title}
        </div>
      )}

      <div className="relative w-full" style={{ height: 'clamp(280px, 38vh, 420px)' }}>
        {error && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center text-center px-6 bg-[#04050d]/90">
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/65">
              Basemap unavailable
            </div>
          </div>
        )}
        {!ready && !error && (
          <div className="absolute inset-0 z-[450] flex items-center justify-center bg-[#04050d]/80">
            <div className="inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
              <Loader2 className="h-3 w-3 animate-spin text-[#c9a24a]" />
              Loading map…
            </div>
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" style={{ background: '#e8ece6' }} />
      </div>

      <div className="absolute bottom-2.5 left-3 right-3 z-[400] flex items-center justify-between font-mono text-[8.5px] tracking-[0.22em] uppercase text-[#cfc8b8]/65 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 pointer-events-auto bg-[#04050d]/70 backdrop-blur px-2 py-0.5 rounded-full border border-white/10">
          <Globe2 className="h-2.5 w-2.5 text-[#c9a24a]" />
          {validPoints.length.toLocaleString()} live records
        </span>
        {atlasHref && (
          <Link
            to={atlasHref}
            className="pointer-events-auto text-[#c9a24a]/85 hover:text-[#c9a24a] transition-colors bg-[#04050d]/70 backdrop-blur px-2 py-0.5 rounded-full border border-white/10"
          >
            Open in Atlas →
          </Link>
        )}
        {validPoints.length === 0 && (
          <span className="pointer-events-auto text-[#7a7466] bg-[#04050d]/70 backdrop-blur px-2 py-0.5 rounded-full border border-white/10">
            No linked data available yet.
          </span>
        )}
      </div>
    </div>
  );
};

export default AtlasMiniMap;
