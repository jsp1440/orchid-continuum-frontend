import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ExplorerMapHandle, ExplorerMapProps } from './ExplorerMap';
import { googleMapTypeFor, loadGoogleMaps, type GoogleMapsConfig } from './googleMaps';
import { clusterFeatures, clusterRadius, gridFeatures, gridForRecords, pointFeatures } from './googleOverlays';
import { normaliseViewport } from './geo';
import { PALETTE } from './palette';

const INITIAL = { center: { lat: 4, lng: -62 }, zoom: 3 };

export interface GoogleExplorerMapProps extends ExplorerMapProps {
  config: GoogleMapsConfig;
  onUnavailable(detail: string): void;
}

const GoogleExplorerMap = React.forwardRef<ExplorerMapHandle, GoogleExplorerMapProps>(function GoogleExplorerMap(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    flyToBounds([w, s, e, n]) {
      mapRef.current?.fitBounds({ west: w, south: s, east: e, north: n }, 60);
    },
    zoomBy(delta) {
      const map = mapRef.current;
      if (map) map.setZoom((map.getZoom() ?? INITIAL.zoom) + delta);
    },
    resetView() {
      const map = mapRef.current;
      if (!map) return;
      map.setCenter(INITIAL.center);
      map.setZoom(INITIAL.zoom);
      map.setTilt(0);
      map.setHeading(0);
    },
    // Google's terms do not allow exporting its imagery to a canvas or image file.
    async exportPng() {
      return null;
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let idleListener: google.maps.MapsEventListener | null = null;
    loadGoogleMaps(propsRef.current.config).then((result) => {
      if (cancelled) return;
      if (result.kind === 'failed') {
        propsRef.current.onUnavailable(result.detail);
        return;
      }
      if (!containerRef.current) return;
      const { config, basemap } = propsRef.current;
      const map = new google.maps.Map(containerRef.current, {
        center: INITIAL.center,
        zoom: INITIAL.zoom,
        mapTypeId: googleMapTypeFor(basemap),
        ...(config.mapId ? { mapId: config.mapId } : {}),
        streetViewControl: false,
        fullscreenControl: true,
        mapTypeControl: false,
        gestureHandling: 'greedy',
      });
      mapRef.current = map;
      map.data.setStyle((feature) => {
        const kind = feature.getProperty('kind');
        if (kind === 'grid') {
          const intensity = Number(feature.getProperty('intensity')) || 0;
          return {
            fillColor: '#0f766e',
            fillOpacity: 0.15 + 0.6 * intensity,
            strokeColor: '#134e4a',
            strokeOpacity: 0.4,
            strokeWeight: 1,
            clickable: false,
          };
        }
        if (kind === 'cluster') {
          return {
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: clusterRadius(Number(feature.getProperty('count')) || 1),
              fillColor: PALETTE.cluster,
              fillOpacity: 0.82,
              strokeColor: '#ffffff',
              strokeWeight: 1.5,
            },
            title: String(feature.getProperty('label') ?? ''),
          };
        }
        const generalised = feature.getProperty('generalised') === true;
        const id = String(feature.getProperty('id') ?? '');
        const selected = id !== '' && id === propsRef.current.selectedId;
        return {
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: selected ? 9 : 6,
            fillColor: String(feature.getProperty('color') ?? PALETTE.point),
            fillOpacity: generalised ? 0.55 : 0.95,
            strokeColor: selected ? PALETTE.selected : '#ffffff',
            strokeWeight: selected ? 3 : generalised ? 2 : 1,
          },
          title: String(feature.getProperty('name') ?? ''),
          zIndex: selected ? 10 : 1,
        };
      });
      map.data.addListener('click', (event: google.maps.Data.MouseEvent) => {
        if (event.feature.getProperty('kind') === 'point') {
          propsRef.current.onSelectRecord(String(event.feature.getProperty('id')));
        } else if (event.feature.getProperty('kind') === 'cluster' && event.latLng) {
          map.panTo(event.latLng);
          map.setZoom((map.getZoom() ?? INITIAL.zoom) + 2);
        }
      });
      idleListener = map.addListener('idle', () => {
        const b = map.getBounds()?.toJSON();
        if (!b) return;
        propsRef.current.onViewportChange(
          normaliseViewport({ west: b.west, east: b.east, south: b.south, north: b.north, zoom: map.getZoom() ?? INITIAL.zoom }),
        );
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
      idleListener?.remove();
      mapRef.current = null;
    };
  }, []);

  // Basemap and tilt. Tilt applies only where Google serves 45-degree imagery.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setMapTypeId(googleMapTypeFor(props.basemap));
    map.setTilt(props.terrain3d && props.basemap === 'imagery' ? 45 : 0);
  }, [props.basemap, props.terrain3d, ready]);

  // Overlays: rebuilt when the (already locality-safe) data or layer choice changes.
  const { records, clusters, mode, activeLayers, colorMode, gridDeg, selectedId } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const old: google.maps.Data.Feature[] = [];
    map.data.forEach((f) => old.push(f));
    old.forEach((f) => map.data.remove(f));
    const showOcc =
      activeLayers.has('occurrences') || activeLayers.has('record-age') || activeLayers.has('conservation-assessment') || activeLayers.has('occurrence-density');
    const gridOn = activeLayers.has('observed-richness') || activeLayers.has('sampling-gaps');
    const features: GeoJSON.Feature[] = [];
    if (gridOn && records.length) {
      features.push(...gridFeatures(gridForRecords(records, gridDeg), activeLayers.has('observed-richness') ? 'taxa' : 'records'));
    }
    if (showOcc && mode === 'points') features.push(...pointFeatures(records, colorMode));
    if (showOcc && mode === 'clusters') features.push(...clusterFeatures(clusters));
    map.data.addGeoJson({ type: 'FeatureCollection', features });
  }, [records, clusters, mode, activeLayers, colorMode, gridDeg, selectedId, ready]);

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Interactive orchid occurrence map on Google Maps. Use the controls to zoom and change the map type."
        data-testid="atlas-explorer-google-map"
      />
    </div>
  );
});

export default GoogleExplorerMap;
