/**
 * useLeaflet — bundled loader for Leaflet.
 *
 * Leaflet is a real npm dependency (see package.json), imported directly
 * rather than injected from an external CDN at runtime. The Atlas map
 * previously depended on unpkg.com being reachable from the visitor's
 * browser at page-load time; any CDN outage, ad-blocker, or restrictive
 * network policy took the entire map down with "Leaflet failed to load
 * from the CDN." Bundling removes that external runtime dependency
 * entirely — the map ships in the same JS bundle as everything else.
 *
 * The hook's public shape (`{ ready, error, L }`) is unchanged so every
 * existing consumer (AtlasMap, LiveAtlasMap, AtlasMiniMap, HomeAtlas)
 * keeps working without modification.
 */

import { useEffect, useState } from 'react';
import * as LeafletNS from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface UseLeafletState {
  ready: boolean;
  error: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L: any | null;
}

export function useLeaflet(): UseLeafletState {
  const [state, setState] = useState<UseLeafletState>({
    ready: true,
    error: null,
    L: LeafletNS,
  });

  // No async loading step remains, but keep the effect so any future
  // failure mode (e.g. a lazy-loaded plugin) has a place to report into
  // the same `error` state consumers already handle.
  useEffect(() => {
    setState({ ready: true, error: null, L: LeafletNS });
  }, []);

  return state;
}
