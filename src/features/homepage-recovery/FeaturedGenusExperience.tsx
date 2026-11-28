import { featuredSpecies, featuredSpeciesLabel } from './featuredSpecies';
import type { GenusMediaItem } from '@/lib/genusMediaResolver';
import { useFeaturedPhotoPages } from './useFeaturedPhotoPages';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { featuredTaxonCalyxHref, featuredTaxonGenusProfileHref, featuredTaxonMatrixHref } from '@/lib/featuredTaxonNavigation';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { speciesPageHrefForMedia } from '@/lib/speciesDossier';

function PhotoCredit({ item }: { item: GenusMediaItem }) {
  const label = item.licence_name || item.license;
  const url = (item.licence_url || item.license)?.trim()
    .match(/^https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[a-z-]+\/\d+(?:\.\d+)*(?:\/[a-z-]+)?\/?$/i)?.[0]
    .replace(/^http:/i, 'https:');
  return <>{item.attribution || 'Photographer not supplied'} · {item.source_name} · {url
    ? <a href={url} target="_blank" rel="noopener noreferrer license">{label}</a> : label}</>;
}

export default function FeaturedGenusExperience() {
  const daily = useDailyGenus();
  return <GenusGallery key={daily.genus} {...daily} />;
}

function GenusGallery({ genus, continuum, continuumStatus }: ReturnType<typeof useDailyGenus>) {
  const reduced = usePrefersReducedMotion();
  const section = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState<{ name: string | null; index: number }>({ name: null, index: 0 });
  const [pendingNext, setPendingNext] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const fallback = useMemo(() => featuredSpecies(continuum?.genus === genus ? continuum.media.items : [], genus), [continuum, genus]);
  const pages = useFeaturedPhotoPages(genus, fallback, visible, selection, failed);
  const { items, index, extend, canWrap, canSearch } = pages;
  const selectIndex = useCallback((next: number) => {
    const photo = items[next];
    if (photo) setSelection({ name: featuredSpeciesLabel(photo.scientific_name).toLowerCase(), index: next });
  }, [items]);
  const active = items[index];
  const choose = (next: number) => {
    setPaused(true);
    extend();
    setPendingNext(false);
    if (next >= 0 && next < items.length) selectIndex(next);
    else if (items.length && (next < 0 || canWrap)) selectIndex((next + items.length) % items.length);
    else if (next >= items.length) setPendingNext(true);
  };
  useEffect(() => {
    if (!pendingNext) return;
    if (index + 1 < items.length) {
      selectIndex(index + 1);
      setPendingNext(false);
    } else if (canWrap && items.length) {
      selectIndex(0);
      setPendingNext(false);
    }
  }, [pendingNext, items.length, index, selectIndex, canWrap]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || reduced || !visible || (!items.length && !canSearch)) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      extend();
      if (!items.length) return;
      if (index + 1 < items.length) selectIndex(index + 1);
      else if (canWrap) selectIndex(0);
      else setPendingNext(true);
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused, reduced, visible, index, items.length, canWrap, canSearch, extend, selectIndex]);
  const tiles = items.slice(index + 1, index + 10);
  if (canWrap && tiles.length < 9) tiles.push(...items.slice(0, Math.min(index, 9 - tiles.length)));
  return <section ref={section} id="featured-genus" className="recovery-feature recovery-width" aria-labelledby="featured-heading"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}>
    <div className="recovery-section-heading"><div><p className="recovery-kicker">A living introduction · Featured Genus</p>
      <h2 id="featured-heading"><i>{genus}</i></h2></div><span className="recovery-note">A new genus every 12 hours · Stay and study</span></div>
    <div className="recovery-exhibit">
      <figure className="recovery-hero-photo" data-uncropped={active && active.unmodified_only !== false}>
        {active ? <Link className="recovery-photo-link" to={speciesPageHrefForMedia(active.scientific_name, active.taxon_id)} aria-label={`Open dossier for pictured ${active.scientific_name}`}><img key={active.image_url} src={active.image_url} alt={active.scientific_name}
          onError={() => setFailed(previous => [...previous, active.image_url])} /></Link>
          : <div className="recovery-photo-empty" role="status">{continuumStatus === 'loading' || pages.loading ? 'Finding source-licensed photographs…' : canSearch ? 'More photo pages to search.' : 'Photographs are not available from the current source response.'}</div>}
        {active && <figcaption><h3><i>{featuredSpeciesLabel(active.scientific_name)}</i></h3>
          <p><PhotoCredit item={active} /></p>
          {active.share_alike_notice === true && <p>ShareAlike applies to adaptations of this photograph.</p>}
          <div className="recovery-photo-links">
            <Link to={speciesPageHrefForMedia(active.scientific_name, active.taxon_id)} aria-label={`Species dossier for ${active.scientific_name}`}>Species dossier</Link>
            {active.source_record_url && /^https?:\/\//i.test(active.source_record_url) && <a href={active.source_record_url} target="_blank" rel="noreferrer">Original source record ↗</a>}
          </div>
        </figcaption>}
      </figure>
      <div className="recovery-study"><p className="recovery-kicker">One genus, many forms</p>
        <p>Open a photograph for its species dossier, or select a name to study the species here.</p>
        <div className="recovery-species-grid" role="group" aria-label={`${genus} species photographs`}>
          {tiles.map((item) => <div key={item.media_id + item.image_url}>
            <Link className="recovery-tile-photo" to={speciesPageHrefForMedia(item.scientific_name, item.taxon_id)} aria-label={`Open dossier for ${item.scientific_name}`}>
              <img src={item.image_url} alt="" loading="lazy" data-uncropped={item.unmodified_only !== false} onError={() => setFailed(previous => [...previous, item.image_url])} />
            </Link>
            <button type="button" aria-label={`Study ${featuredSpeciesLabel(item.scientific_name)}`} onClick={() => choose(items.indexOf(item))}>
              <i>{featuredSpeciesLabel(item.scientific_name).split(' ').slice(1).join(' ')}</i>
            </button>
            <small><PhotoCredit item={item} /></small>
          </div>)}
        </div>
        {canWrap && items.length > 0 && items.length < 10 && <p className="recovery-note">{items.length} displayable photographs available in this selection.</p>}
        {pages.unavailable && <p role="status">Additional species photographs are unavailable. <button onClick={pages.retry}>Retry photographs</button></p>}
        {pages.canSearch && <button onClick={pages.extend}>Continue searching for photographs</button>}
        {pages.loading && !active && <p role="status">Checking the public photo collection…</p>}
        <div className="recovery-controls"><button disabled={items.length < 2} onClick={() => choose(index - 1)} aria-label="Previous species">←</button>
          <button disabled={items.length < 2 && !canSearch} onClick={() => setPaused(value => !value)}>{paused || reduced ? 'Study mode' : 'Pause rotation'}</button>
          <button disabled={!items.length || pendingNext || (items.length === 1 && canWrap)} onClick={() => choose(index + 1)} aria-label="Next species">→</button>
          <span>{items.length ? `${index + 1} / ${items.length} loaded` : pages.loading || continuumStatus === 'loading' ? 'Finding photographs…' : (canSearch ? 'More photo pages to search' : pages.unavailable ? 'Photographs unavailable' : 'No displayable photographs')}</span></div>
        <p className="recovery-note">{reduced ? 'Automatic rotation is off for reduced motion.' : paused ? 'Paused for study. Select Study mode to resume the 45-second rotation.' : 'Rotation pauses while you read, focus a control, or leave this section.'}</p>
        <div className="recovery-genus-story"><h3>Meet the genus</h3>
          <p>Follow the photographs into the genus record to explore what has been documented, and what remains unknown.</p>
          <p className="recovery-note">These source-named photographs do not establish ecological relationships. Species-level interpretation must be supported by its own evidence.</p>
          <Link to={featuredTaxonGenusProfileHref(genus)}>Read the {genus} record ↗</Link></div>
      </div>
    </div>
    <div className="recovery-connected"><p>Keep following <i>{genus}</i></p><Link to={featuredTaxonMatrixHref(genus)}>Inspect the evidence relationships ↗</Link>
      <Link to={featuredTaxonCalyxHref(genus)}>Explore with Calyx ↗</Link></div>
  </section>;
}
