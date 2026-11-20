import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { fetchGenusOccurrences } from '@/lib/ocBackend';
import { UNRESOLVED_FLOOR_DEG } from '@/lib/atlasLocalitySafety';
import { featuredTaxonAtlasNextHref } from '@/lib/featuredTaxonNavigation';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import AtlasMiniMap from '@/components/orchid/AtlasMiniMap';
const AtlasGlobe = lazy(() => import('@/features/atlas-next/AtlasGlobe'));
class GlobeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="recovery-globe-fallback" role="status">This device could not display the globe. Use the 2D map or record list.</p> : this.props.children; }
}
export default function HomepageAtlasExperience() {
  const { genus } = useDailyGenus();
  const reduced = usePrefersReducedMotion();
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px' });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  const [view, setView] = useState<{ genus: string; points: AtlasOccurrencePoint[]; loading: boolean }>({ genus, points: [], loading: true });
  const [globeUnavailable, setGlobeUnavailable] = useState(false);
  const [mode, setMode] = useState<'globe' | 'map'>('globe');
  const [rotate, setRotate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setView({ genus, points: [], loading: true }); setSelected(null);
    void fetchGenusOccurrences(genus, 500, controller.signal, UNRESOLVED_FLOOR_DEG).then(rows => {
      if (controller.signal.aborted) return;
      const points: AtlasOccurrencePoint[] = rows.filter(row => row.species.split(/\s+/)[0].toLowerCase() === genus.toLowerCase()).map(row => ({
        id: row.id, lat: row.lat, lng: row.lng, genus, species: row.species.split(/\s+/).slice(1).join(' '), canonicalName: row.species,
        country: row.country || '', countries: row.country ? [row.country] : [], dataset: 'Orchid Continuum', verified: false, pollinators: [], assessmentResolved: false,
      }));
      setView({ genus, points, loading: false });
    }).catch(() => { if (!controller.signal.aborted) setView({ genus, points: [], loading: false }); });
    return () => controller.abort();
  }, [genus]);
  const points = view.genus === genus ? view.points : [];
  const loading = view.genus !== genus || view.loading;
  const point = points.find(item => item.id === selected);
  const href = featuredTaxonAtlasNextHref(genus);
  return <section ref={section} className="recovery-atlas" id="living-atlas" aria-labelledby="atlas-heading"><div className="recovery-width">
    <div className="recovery-section-heading"><div><p className="recovery-kicker">Follow the same genus into the world</p><h2 id="atlas-heading">The Living Atlas</h2></div><Link to={href}>Open the Atlas workspace ↗</Link></div>
    <div className="recovery-atlas-layout"><div className="recovery-atlas-instrument">
      <div className="recovery-controls" role="group" aria-label="Atlas view"><button aria-pressed={mode === 'globe'} onClick={() => setMode('globe')}>Globe</button><button aria-pressed={mode === 'map'} onClick={() => setMode('map')}>2D map</button>
        {mode === 'globe' && <button disabled={reduced} aria-pressed={rotate && !reduced} onClick={() => setRotate(value => !value)}>{rotate && !reduced ? 'Stop rotation' : 'Rotate globe'}</button>}</div>
      <div className="recovery-map-surface">{mode === 'globe' ? globeUnavailable ? <p className="recovery-globe-fallback" role="status">This device could not display the globe. Use the 2D map or record list.</p> : visible ? <GlobeBoundary><Suspense fallback={<p className="recovery-globe-fallback">Preparing the globe…</p>}>
        <AtlasGlobe marks={points.map(item => ({ id: item.id, lat: item.lat, lng: item.lng, radius: 0.6, color: item.id === selected ? '#ffffff' : '#d4b34a' }))}
          focus={point ? { lat: point.lat, lng: point.lng, distance: 230 } : null} autoRotate={rotate && !reduced} onSelect={setSelected} onUnavailable={() => setGlobeUnavailable(true)} />
      </Suspense></GlobeBoundary> : <p className="recovery-globe-fallback">Explore the globe here.</p> : <AtlasMiniMap points={points} title={`${genus} · returned occurrence records`} atlasHref={href} cap={500} />}</div>
    </div><div className="recovery-atlas-story"><h3>Where has <i>{genus}</i> been recorded?</h3>
      <p>Move around the globe, switch to the map, or select a record. The photographs above and the Atlas share the same genus.</p>
      <p role="status">{loading ? 'Loading occurrence records…' : points.length ? `${points.length} returned records, capped at 500. This sample is not a complete range.` : 'No displayable records returned. The service may be unavailable or have no mapped records; this does not establish absence.'}</p>
      <p className="recovery-note">Locations pass through the existing public sensitivity and uncertainty policy. Detailed locality text is withheld here.</p>
      {points.length > 0 && <label className="recovery-record-picker">Inspect a returned record<select aria-label="Select occurrence record" value={selected || ''} onChange={event => setSelected(event.target.value || null)}><option value="">Choose a record</option>{points.map((item, index) => <option key={`${item.id}-${index}`} value={item.id}>{index + 1}. {item.canonicalName} · {item.country || 'Country not supplied'}</option>)}</select></label>}
      {point && <p role="status"><i>{point.canonicalName}</i> · {point.country || 'Country not supplied'} · Occurrence service record {point.id}. A plotted record does not establish habitat suitability or a verified identification.</p>}
      <details><summary>Beyond occurrence points</summary><p>The recovered Atlas blueprint connects climate, terrain, geology, soils, water, habitat change, ecological relationships, and time. These layers require traceable datasets and scientific interpretation.</p><p>This homepage preview implements the occurrence view. It does not yet implement those thematic layers. The Atlas workspace contains the existing scale and question controls.</p></details>
      <Link to={href}>Continue exploring {genus} ↗</Link>
    </div></div>
  </div></section>;
}
