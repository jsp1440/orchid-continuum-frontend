import { featuredSpecies } from './featuredSpecies';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { displayScientificName } from '@/lib/genusProfileDataQuality';
import { featuredTaxonCalyxHref, featuredTaxonGenusProfileHref, featuredTaxonMatrixHref } from '@/lib/featuredTaxonNavigation';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export default function FeaturedGenusExperience() {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const reduced = usePrefersReducedMotion();
  const section = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState({ genus, index: 0 });
  const [failed, setFailed] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const items = useMemo(() => featuredSpecies(continuum?.genus === genus ? continuum.media.items : [], genus)
    .filter(item => !failed.includes(item.image_url)), [continuum, genus, failed]);
  const index = selection.genus === genus && items.length ? selection.index % items.length : 0;
  const active = items[index];
  const choose = (next: number) => { setPaused(true); setSelection({ genus, index: (next + items.length) % items.length }); };
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || reduced || !visible || items.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setSelection({ genus, index: (index + 1) % items.length });
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused, reduced, visible, genus, index, items.length]);
  const start = Math.min(Math.max(0, index - 4), Math.max(0, items.length - 9));
  return <section ref={section} id="featured-genus" className="recovery-feature recovery-width" aria-labelledby="featured-heading"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}>
    <div className="recovery-section-heading"><div><p className="recovery-kicker">A living introduction · Featured Genus</p>
      <h2 id="featured-heading"><i>{genus}</i></h2></div><span className="recovery-note">A new genus every 12 hours · Stay and study</span></div>
    <div className="recovery-exhibit">
      <figure className="recovery-hero-photo">
        {active ? <img key={active.image_url} src={active.image_url} alt={active.scientific_name}
          onError={() => setFailed(previous => [...previous, active.image_url])} />
          : <div className="recovery-photo-empty" role="status">{continuumStatus === 'loading' ? 'Finding source-licensed photographs…' : 'Photographs are not available from the current source response.'}</div>}
        {active && <figcaption><h3><i>{displayScientificName(active.scientific_name)}</i></h3>
          <p>{active.attribution || 'Photographer not supplied'} · {active.source_name} · {active.license}</p>
          {active.source_record_url && /^https?:\/\//i.test(active.source_record_url) && <a href={active.source_record_url} target="_blank" rel="noreferrer">Original source record ↗</a>}
        </figcaption>}
      </figure>
      <div className="recovery-study"><p className="recovery-kicker">One genus, many forms</p>
        <p>Choose a photograph to study its species. Its name, credit, and source travel together.</p>
        <div className="recovery-species-grid" role="group" aria-label={`${genus} species photographs`}>
          {items.slice(start, start + 9).map((item, offset) => <button key={item.media_id + item.image_url} type="button"
            aria-label={`Study ${displayScientificName(item.scientific_name)}`} aria-pressed={start + offset === index}
            onClick={() => choose(start + offset)}>
            <img src={item.image_url} alt="" loading="lazy" onError={() => setFailed(previous => [...previous, item.image_url])} />
            <span><i>{displayScientificName(item.scientific_name).split(' ').slice(1).join(' ')}</i></span>
          </button>)}
        </div>
        {items.length > 0 && items.length < 9 && <p className="recovery-note">{items.length} displayable source photographs are available in this response; the exhibit supports up to nine at a time.</p>}
        <div className="recovery-controls"><button disabled={items.length < 2} onClick={() => choose(index - 1)} aria-label="Previous species">←</button>
          <button disabled={items.length < 2} onClick={() => setPaused(value => !value)}>{paused || reduced ? 'Study mode' : 'Pause rotation'}</button>
          <button disabled={items.length < 2} onClick={() => choose(index + 1)} aria-label="Next species">→</button>
          <span>{items.length ? `${index + 1} / ${items.length}` : 'No photographs'}</span></div>
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
