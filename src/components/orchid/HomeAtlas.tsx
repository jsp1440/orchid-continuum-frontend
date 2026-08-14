import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarRange,
  Cloud,
  Globe2,
  Info,
  Loader2,
  MapPin,
  Mountain,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { useLeaflet } from '@/hooks/useLeaflet';
import { useHomepageFeatured } from '@/lib/homepageFeaturedContext';
import {
  loadHomepageAtlasGenus,
  type HomepageAtlasLoadState,
  type HomepageAtlasPoint,
} from '@/lib/homepageAtlasData';

type ThemeId =
  | 'distribution'
  | 'habitat'
  | 'climate'
  | 'relationships'
  | 'flowering'
  | 'conservation';

type ThemeDefinition = {
  id: ThemeId;
  label: string;
  icon: React.ReactNode;
  available: boolean;
  explanation: string;
};

const HomeAtlas: React.FC = () => {
  const { ready, error: leafletError, L } = useLeaflet();
  const {
    genus,
    activeSpecies,
    habitatSummary,
    elevationSummary,
    climateSummary,
    relationshipAvailability,
  } = useHomepageFeatured();

  const [loadState, setLoadState] = useState<HomepageAtlasLoadState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTheme, setActiveTheme] = useState<ThemeId>('distribution');
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadState(null);
    void loadHomepageAtlasGenus(genus, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setLoadState(result);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === 'AbortError') return;
        setLoadState({
          status: 'error',
          points: [],
          httpStatus: null,
          message: 'Atlas occurrence service could not be reached.',
        });
        setLoading(false);
      });
    return () => controller.abort();
  }, [genus]);

  const genusPoints = loadState?.status === 'ok' ? loadState.points : [];

  const speciesPoints = useMemo(() => {
    if (!activeSpecies) return [];
    const wanted = activeSpecies.trim().toLowerCase();
    return genusPoints.filter((point) => point.species.trim().toLowerCase() === wanted);
  }, [genusPoints, activeSpecies]);

  const displayedPoints = speciesPoints.length > 0 ? speciesPoints : genusPoints;
  const speciesFallbackToGenus = !!activeSpecies && speciesPoints.length === 0 && genusPoints.length > 0;

  const themes = useMemo<ThemeDefinition[]>(() => {
    const hasElevation = displayedPoints.some((point) => point.elevationM != null) || !!elevationSummary;
    const hasHabitat = displayedPoints.some((point) => !!point.habitat || !!point.biome) || !!habitatSummary;
    return [
      {
        id: 'distribution',
        label: 'Where it lives',
        icon: <MapPin className="h-4 w-4" />,
        available: displayedPoints.length > 0,
        explanation: displayedPoints.length > 0
          ? `${displayedPoints.length.toLocaleString()} georeferenced occurrence records are available in the current response.`
          : 'No georeferenced occurrence records are available in the current response.',
      },
      {
        id: 'habitat',
        label: 'Habitat & elevation',
        icon: <Mountain className="h-4 w-4" />,
        available: hasElevation || hasHabitat,
        explanation: hasElevation || hasHabitat
          ? 'Habitat or elevation context exists, but this first public slice does not pretend that text metadata is a complete spatial habitat layer.'
          : 'A spatial habitat/elevation layer is not available for this taxon in the current homepage contract.',
      },
      {
        id: 'climate',
        label: 'Climate',
        icon: <Cloud className="h-4 w-4" />,
        available: !!climateSummary,
        explanation: climateSummary
          ? climateSummary
          : 'A taxon-linked spatial climate layer is not available in the current homepage contract.',
      },
      {
        id: 'relationships',
        label: 'Relationships',
        icon: <Network className="h-4 w-4" />,
        available: relationshipAvailability === 'available',
        explanation: relationshipAvailability === 'available'
          ? 'Relationship evidence exists for this genus, but geographic overlap must remain distinct from non-spatial relationship records.'
          : 'A geographic pollinator or mycorrhizal overlap layer is not available for this taxon in the current homepage contract.',
      },
      {
        id: 'flowering',
        label: 'Flowering through time',
        icon: <CalendarRange className="h-4 w-4" />,
        available: false,
        explanation: 'Occurrence years are not flowering dates. A defensible phenology layer requires explicit flowering/observation timing evidence.',
      },
      {
        id: 'conservation',
        label: 'Conservation & gaps',
        icon: <ShieldCheck className="h-4 w-4" />,
        available: false,
        explanation: 'Protected-area, risk, and sampling-gap layers are not yet exposed through the homepage Atlas contract.',
      },
    ];
  }, [displayedPoints, elevationSummary, habitatSummary, climateSummary, relationshipAvailability]);

  const selectedTheme = themes.find((theme) => theme.id === activeTheme) ?? themes[0];

  useEffect(() => {
    if (!ready || !L || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [5, 20],
      zoom: 2,
      minZoom: 2,
      maxZoom: 12,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      maxBounds: [[-85, -240], [85, 240]],
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map);

    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize(false));

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [ready, L]);

  useEffect(() => {
    if (!ready || !L || !mapRef.current) return;
    const map = mapRef.current;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (displayedPoints.length === 0) return;

    const layer = L.layerGroup();
    const bounds: [number, number][] = [];

    displayedPoints.forEach((point: HomepageAtlasPoint) => {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 5,
        color: '#102016',
        weight: 0.8,
        fillColor: '#d4b34a',
        fillOpacity: 0.88,
      });
      const country = (point.country || 'Country not supplied').replace(/</g, '&lt;');
      const name = point.species.replace(/</g, '&lt;');
      marker.bindTooltip(
        `<div style="font-family:ui-sans-serif,system-ui;color:#0d1224;background:rgba(255,255,255,0.97);padding:4px 7px;border-radius:4px;font-size:11px"><strong><em>${name}</em></strong><div style="opacity:.7">${country}${point.year ? ` · ${point.year}` : ''}</div></div>`,
        { direction: 'top', opacity: 1 },
      );
      layer.addLayer(marker);
      bounds.push([point.lat, point.lng]);
    });

    layer.addTo(map);
    layerRef.current = layer;

    if (bounds.length === 1) map.setView(bounds[0], 5);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 6 });
  }, [displayedPoints, ready, L]);

  const mapStatusText = loading
    ? 'Loading occurrence evidence…'
    : loadState?.status === 'error'
      ? 'Map data are temporarily unavailable.'
      : loadState?.status === 'empty'
        ? 'No occurrence records were returned for this genus.'
        : `${displayedPoints.length.toLocaleString()} records in view`;

  return (
    <section className="relative overflow-hidden border-b border-white/[0.06] bg-[#07110c] text-[#f5f0e8]">
      <div className="mx-auto max-w-[1500px] px-6 py-12 lg:px-10 lg:py-16">
        <div className="grid gap-8 xl:grid-cols-[0.78fr_1.22fr] xl:items-start">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.30em] text-[#c9a24a]">
              <Globe2 className="h-4 w-4" />
              Orchid Atlas
            </div>
            <h2 className="mt-4 max-w-2xl font-serif text-4xl leading-tight text-[#fffaf0] sm:text-5xl">
              See {activeSpecies || genus} in place.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#d8cfbd]/82">
              Start with real occurrence evidence, then move into thematic layers only where the underlying data support them.
            </p>

            <div className="mt-7 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => theme.available && setActiveTheme(theme.id)}
                  disabled={!theme.available}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    activeTheme === theme.id
                      ? 'border-[#d4b34a]/80 bg-[#d4b34a]/14 text-[#fffaf0]'
                      : theme.available
                        ? 'border-white/10 bg-white/[0.04] text-[#e7dfd1] hover:border-[#d4b34a]/40'
                        : 'cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-[#8e9189]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {theme.icon}
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em]">{theme.label}</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] opacity-70">
                    {theme.available ? 'Available' : 'Not yet'}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#d4b34a]" />
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#d4b34a]">
                    {selectedTheme.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#d8cfbd]/80">{selectedTheme.explanation}</p>
                </div>
              </div>
            </div>

            {speciesFallbackToGenus && (
              <p className="mt-4 text-xs leading-5 text-[#c9bfa9]/75">
                No exact occurrence records for <em>{activeSpecies}</em> were present in this response, so the map is showing genus-level <em>{genus}</em> occurrence evidence instead.
              </p>
            )}

            <p className="mt-4 text-xs leading-5 text-[#a8a99f]/75">
              Records show where observations or specimens have been documented. Missing records do not establish biological absence, and point density is not a population-abundance estimate.
            </p>

            <Link
              to="/atlas"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/45 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a] hover:bg-[#d4b34a]/10"
            >
              Open the full Atlas <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] border border-white/[0.10] bg-[#0a1510] shadow-[0_28px_70px_rgba(0,0,0,0.32)]">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">Current view</p>
                <p className="mt-1 text-sm text-[#e7dfd1]">{mapStatusText}</p>
              </div>
              {loading && <Loader2 className="h-5 w-5 animate-spin text-[#d4b34a]" />}
            </div>

            {loadState?.status === 'error' ? (
              <div className="flex min-h-[460px] items-center justify-center px-8 text-center">
                <div>
                  <Globe2 className="mx-auto h-10 w-10 text-[#d4b34a]/70" />
                  <p className="mt-4 font-serif text-2xl text-[#fffaf0]">Atlas data temporarily unavailable</p>
                  <p className="mt-3 max-w-md text-sm leading-6 text-[#d8cfbd]/70">
                    {loadState.message} This is a service state, not evidence that the orchid is absent.
                  </p>
                </div>
              </div>
            ) : leafletError ? (
              <div className="flex min-h-[460px] items-center justify-center px-8 text-center">
                <p className="text-sm leading-6 text-[#d8cfbd]/70">The map library could not load. Occurrence evidence has not been interpreted as absent.</p>
              </div>
            ) : (
              <div ref={containerRef} className="h-[460px] w-full sm:h-[520px] lg:h-[600px]" aria-label={`Occurrence map for ${activeSpecies || genus}`} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeAtlas;
