import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import AtlasGlobe, { type GlobeMark } from './AtlasGlobe';
import OccurrenceCard from './OccurrenceCard';
import { useAtlasData } from './useAtlasData';
import { resolveLocation } from './sensitivity';
import { aggregate, ascend, descend, focusFor, resolveScaleAvailability, type Focus } from './scale';
import { buildAtlasContext } from './atlasContext';
import {
  SCALES,
  SCALE_ORDER,
  type AtlasAccessLevel,
  type ScaleLevel,
} from './types';
import { QUESTIONS, QUESTION_ORDER, resolveAvailability, type QuestionId } from './questions';
import { profileOf, recordEvidence, tierOf, TIER_COPY, gapSentences, type CompletenessTier } from './knowledgeGap';
import { DEFAULT_TIME_STATE, withinTime, type AtlasTimeState } from './time';
import { mapboxConfig } from './mapboxConfig';
import { buildInvestigation, type StepId } from './investigation';
import RegionalMap, { type RegionalView } from './RegionalMap';
import GuidePanel from './GuidePanel';

/**
 * ATLAS-NEXT — the spatial reasoning shell.
 *
 * One question is implemented: WHERE DOES IT LIVE? Everything on screen serves
 * that question at whatever scale the viewer is standing at. The other modes
 * are listed, disabled, and each says what is blocking it — a mode that cannot
 * be answered honestly is better shown as an open question than as an empty
 * map.
 *
 * The prototype's control panel (continent dropdown, elevation slider, month
 * slider, dot toggle, auto-rotate toggle) is not reproduced. That is the GIS
 * dashboard shape: a pile of orthogonal switches with no question behind them.
 */

const ACCESS: AtlasAccessLevel = 'public';

// Kept close to the prototype's regional palette, but keyed to what the record
// actually says rather than to a longitude guess.
const MARK_COLOR = '#8fd0a8';
const MARK_PROTECTED = '#d8b24c';
const MARK_SELECTED = '#f0ede4';

/**
 * Ceiling on individually drawn marks.
 *
 * With instanced rendering the whole layer is two draw calls, so this was never
 * a frame-time limit — it was a legibility guess, set at 20,000. Against the
 * real store that guess started truncating the signature view: the knowledge-gap
 * question draws every record individually, because a cell containing both a
 * well-documented record and a bare coordinate has no single honest colour, and
 * the Atlas holds 31,092 records. A view about what is missing must not itself
 * be missing 11,000 records.
 *
 * Raised to cover the whole store with room to grow. The limit survives, and
 * the interface still says when it is in force, because a count describing more
 * records than are on screen is the kind of quiet mismatch that turns a map into
 * a misleading one.
 */
const MAX_DRAWN = 60000;

/**
 * The rungs at which the Atlas hands over to the regional engine. Above these a
 * globe shows planetary pattern better than any tiled map; below them a tiled
 * map shows terrain and place better than any globe.
 */
const REGIONAL_FROM: ScaleLevel[] = ['state', 'landscape', 'locality'];

/** Globe camera distance mapped onto a Mapbox zoom, so the handover is continuous. */
const zoomForScale = (level: ScaleLevel): number =>
  ({ earth: 1.5, world: 2.5, continent: 3.5, country: 5, state: 6.5, landscape: 8.5, locality: 11 })[
    level
  ] ?? 6;

const AtlasNextShell: React.FC = () => {
  const data = useAtlasData();
  // Stable identity: an inline `: []` would be a new array every render and
  // would invalidate every memo below it.
  const points = useMemo(() => (data.kind === 'ready' ? data.points : []), [data]);

  const [scale, setScale] = useState<ScaleLevel>('earth');
  const [question, setQuestion] = useState<QuestionId>('where-it-lives');
  const [time] = useState<AtlasTimeState>(DEFAULT_TIME_STATE);
  const [guideStep, setGuideStep] = useState<StepId | null>(null);
  const [genus, setGenus] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [view, setView] = useState({ lat: 0, lng: 0, distance: 350 });
  const [showContext, setShowContext] = useState(false);
  const [regionalView, setRegionalView] = useState<RegionalView | null>(null);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);

  const availability = useMemo(() => resolveScaleAvailability(points), [points]);
  const availableLevels = useMemo(
    () => new Set(availability.filter((a) => a.available).map((a) => a.level)),
    [availability],
  );

  // The records the current question is being asked about.
  const selection = useMemo(() => {
    let out = points;
    if (genus) out = out.filter((p) => p.genus === genus);
    if (country) out = out.filter((p) => p.country === country);
    if (time.mode !== 'all-time') out = out.filter((p) => withinTime(p.year, time));
    return out;
  }, [points, genus, country, time]);

  const genera = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) {
      if (p.genus && p.genus !== 'Unknown') counts.set(p.genus, (counts.get(p.genus) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 24);
  }, [points]);

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    const source = genus ? points.filter((p) => p.genus === genus) : points;
    for (const p of source) {
      if (p.country && p.country !== 'Unknown') counts.set(p.country, (counts.get(p.country) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [points, genus]);

  const descriptor = SCALES[scale];
  const aggregated = descriptor.render === 'aggregated' && question !== 'what-is-not-known-here';

  // The scale ladder decides which engine is showing. Below the country rung a
  // globe stops paying for itself, so the Atlas hands over to a tiled map —
  // same records, same policy, closer camera.
  const mapbox = useMemo(() => mapboxConfig(), []);
  const wantsRegional = REGIONAL_FROM.includes(scale);
  const mapMode: 'globe' | 'regional' = wantsRegional && mapbox.configured ? 'regional' : 'globe';

  const gapMode = question === 'what-is-not-known-here';
  const gapProfile = useMemo(() => profileOf(selection, ACCESS), [selection]);

  // Availability is measured against the records actually in view, so a
  // question can be fully built and still honestly unavailable here.
  const questionAvailability = useMemo(
    () =>
      Object.fromEntries(
        QUESTION_ORDER.map((id) => [id, resolveAvailability(QUESTIONS[id], selection)]),
      ) as Record<QuestionId, ReturnType<typeof resolveAvailability>>,
    [selection],
  );
  const answerable = QUESTION_ORDER.filter(
    (id) => questionAvailability[id].state === 'available',
  ).length;

  const investigation = useMemo(
    () => buildInvestigation(selection, genus ? `${genus} — all records` : 'All genera in the Atlas'),
    [selection, genus],
  );

  const cells = useMemo(
    () => (aggregated ? aggregate(selection, descriptor.aggregationDeg, ACCESS) : []),
    [aggregated, selection, descriptor.aggregationDeg],
  );

  const maxCount = useMemo(() => cells.reduce((m, c) => Math.max(m, c.recordCount), 1), [cells]);

  const marks: GlobeMark[] = useMemo(() => {
    if (aggregated) {
      return cells.map((c) => ({
        id: c.id,
        lat: c.lat,
        lng: c.lng,
        // Area scales with the tally so a cell of 400 reads as heavier than a
        // cell of 4 without pretending to be a density surface.
        radius: descriptor.markRadius * (0.85 + 2.3 * Math.sqrt(c.recordCount / maxCount)),
        color: c.containsProtected ? MARK_PROTECTED : MARK_COLOR,
      }));
    }
    return selection.slice(0, MAX_DRAWN).map((p) => {
      const loc = resolveLocation(p, ACCESS);
      // In gap mode the colour carries how much is KNOWN about the record, not
      // whether its coordinate was coarsened. Two different questions, so they
      // never share an encoding.
      const base = gapMode ? TIER_COPY[tierOf(recordEvidence(p, ACCESS))].tone : MARK_COLOR;
      return {
        id: p.id,
        lat: loc.lat,
        lng: loc.lng,
        radius: descriptor.markRadius * (p.id === selectedId ? 2.1 : 1),
        color:
          p.id === selectedId
            ? MARK_SELECTED
            : gapMode
              ? base
              : loc.policy.generalised
                ? MARK_PROTECTED
                : MARK_COLOR,
        haloDeg: loc.policy.cellDeg,
      };
    });
  }, [aggregated, cells, maxCount, selection, selectedId, descriptor.markRadius, gapMode]);

  const selectedPoint = useMemo(
    () => (selectedId ? selection.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, selection],
  );

  // --- Descent ------------------------------------------------------------
  // Selecting a place moves the camera and steps down one rung. It is the same
  // globe throughout; nothing is swapped for a different map.

  const goToScale = useCallback(
    (next: ScaleLevel, subject: AtlasOccurrencePoint[]) => {
      setScale(next);
      setFocus(focusFor(subject.length ? subject : points, next));
    },
    [points],
  );

  const chooseCountry = useCallback(
    (name: string | null) => {
      setCountry(name);
      setSelectedId(null);
      if (name) {
        const subject = (genus ? points.filter((p) => p.genus === genus) : points).filter(
          (p) => p.country === name,
        );
        goToScale('country', subject);
      } else {
        goToScale('world', points);
      }
    },
    [genus, points, goToScale],
  );

  /** Step down to the next rung the current data can actually organise. */
  const nextAvailable = useCallback(
    (from: ScaleLevel): ScaleLevel => {
      let level = from;
      for (let i = 0; i < SCALE_ORDER.length; i += 1) {
        const candidate = descend(level);
        if (candidate === level) return level; // already at the bottom
        level = candidate;
        if (availableLevels.has(level)) return level;
      }
      return from;
    },
    [availableLevels],
  );

  const onCellOrPoint = useCallback(
    (id: string | null) => {
      if (!id) {
        setSelectedId(null);
        return;
      }
      if (aggregated) {
        const cell = cells.find((c) => c.id === id);
        if (!cell) return;
        // A cell is a tally, so opening it descends rather than selecting a
        // record — there is no single record behind an aggregate.
        const next =
          availableLevels.has('country') && cell.countries.length === 1
            ? 'country'
            : nextAvailable(scale);
        if (cell.countries.length === 1) setCountry(cell.countries[0]);
        setScale(next);
        setFocus({ lat: cell.lat, lng: cell.lng, distance: SCALES[next].cameraDistance });
        return;
      }
      setSelectedId(id);
    },
    [aggregated, cells, scale, availableLevels, nextAvailable],
  );

  const onHover = useCallback(
    (id: string | null, x: number, y: number) => {
      if (!id) {
        setHover(null);
        return;
      }
      if (aggregated) {
        const c = cells.find((cc) => cc.id === id);
        if (!c) return setHover(null);
        setHover({
          text: `${c.recordCount} record${c.recordCount === 1 ? '' : 's'} · ${c.speciesCount} species in this ${Math.round(c.cellDeg * 111)} km cell`,
          x,
          y,
        });
        return;
      }
      const p = selection.find((pp) => pp.id === id);
      setHover(p ? { text: `${p.canonicalName} · ${p.country}`, x, y } : null);
    },
    [aggregated, cells, selection],
  );

  const context = useMemo(
    () =>
      buildAtlasContext({
        route: '/atlas-next',
        accessLevel: ACCESS,
        scale,
        mapMode,
        question,
        time,
        view,
        visiblePoints: selection,
        selected: selectedPoint,
        genus,
        country,
      }),
    [scale, mapMode, question, time, view, selection, selectedPoint, genus, country],
  );

  // Keep the camera report cheap; the globe already throttles it.
  const onCameraChange = useCallback((v: { lat: number; lng: number; distance: number }) => {
    setView(v);
  }, []);

  const protectedCount = context.visible.protectedRecords;
  const impreciseCount = context.visible.impreciseRecords;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#05070b] text-white">
      {/* One engine at a time. Both mounted at once would double the GPU cost
          and let a stale camera show through the seam. */}
      {mapMode === 'globe' ? (
        <AtlasGlobe
          marks={marks}
          focus={focus}
          autoRotate={scale === 'earth' && !selectedId}
          onSelect={onCellOrPoint}
          onHover={onHover}
          onCameraChange={onCameraChange}
        />
      ) : (
        <RegionalMap
          view={regionalView ?? { lat: view.lat, lng: view.lng, zoom: zoomForScale(scale) }}
          marks={marks}
          selectedId={selectedId}
          onSelect={onCellOrPoint}
          onViewChange={setRegionalView}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Header: the question, always visible                              */}
      {/* ---------------------------------------------------------------- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 md:p-6">
        <div className="pointer-events-auto min-w-0">
          <Link
            to="/"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3.5 text-[11px] uppercase tracking-[0.16em] text-white/75 backdrop-blur transition-colors hover:border-white/40 hover:text-white"
          >
            ← Continuum
          </Link>
          <h1
            className="mt-3 text-[26px] leading-[1.1] text-[#f0ede4] md:text-[34px]"
            style={{ fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif' }}
          >
            {QUESTIONS[question].question}
          </h1>
          <p className="mt-1 max-w-[46ch] text-[12.5px] leading-[1.5] text-white/55">
            {gapMode
              ? 'Every mark is an occurrence record, coloured by how much is recorded about it — not by anything about the orchid.'
              : 'Every mark is an occurrence record held by the Continuum. Nothing here is illustrative.'}
          </p>
        </div>

        <span className="pointer-events-auto shrink-0 rounded-full border border-[#7fa8d8]/40 bg-[#7fa8d8]/10 px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#9dc0e0] backdrop-blur">
          Candidate · /atlas-next
        </span>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Scale rail                                                        */}
      {/* ---------------------------------------------------------------- */}
      <nav
        aria-label="Scale"
        className="pointer-events-auto absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-1 rounded-xl border border-white/10 bg-black/50 p-2 backdrop-blur-xl md:flex"
      >
        {SCALE_ORDER.map((level) => {
          const a = availability.find((x) => x.level === level)!;
          const active = level === scale;
          return (
            <button
              key={level}
              type="button"
              disabled={!a.available}
              title={a.available ? SCALES[level].purpose : a.reason}
              onClick={() => goToScale(level, selection)}
              className={`min-h-[40px] rounded-lg px-3 text-left text-[11.5px] tracking-[0.02em] transition-colors ${
                active
                  ? 'bg-[#7fc49a]/15 text-[#a9e0c0]'
                  : a.available
                    ? 'text-white/65 hover:bg-white/[0.07] hover:text-white'
                    : 'cursor-not-allowed text-white/25'
              }`}
            >
              <span className="block">{SCALES[level].label}</span>
              {!a.available && (
                <span className="block font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/25">
                  no data for this scale
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ---------------------------------------------------------------- */}
      {/* Question rail: what the Atlas can and cannot yet answer            */}
      {/* ---------------------------------------------------------------- */}
      {/* The guide drives the question itself, so the rail stands down while it
          is open rather than stacking two controls in the same corner. */}
      <div
        className={`pointer-events-auto absolute bottom-24 left-4 right-4 z-20 md:bottom-6 md:left-24 md:right-auto md:max-w-[400px] ${
          guideStep ? 'hidden' : ''
        }`}
      >
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/55 backdrop-blur-xl">
          <div className="flex flex-wrap gap-1.5 p-2.5">
            {QUESTION_ORDER.map((id) => {
              const q = QUESTIONS[id];
              const a = questionAvailability[id];
              const usable = a.state === 'available';
              const active = id === question;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!usable}
                  onClick={() => usable && setQuestion(id)}
                  title={usable ? q.question : a.reason}
                  className={`min-h-[36px] rounded-full px-3 text-[11.5px] transition-colors ${
                    active
                      ? 'bg-[#7fc49a]/18 text-[#a9e0c0]'
                      : usable
                        ? 'text-white/75 hover:bg-white/[0.07] hover:text-white'
                        : 'cursor-not-allowed text-white/30 line-through decoration-white/20'
                  }`}
                >
                  {q.question}
                </button>
              );
            })}
          </div>
          <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-[1.5] text-white/40">
            {answerable} of {QUESTION_ORDER.length} questions can be answered from what the graph
            holds here. The rest say what is blocking them.
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Knowledge-gap legend                                              */}
      {/* ---------------------------------------------------------------- */}
      {gapMode && (
        <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-20 md:bottom-6 md:left-auto md:right-[292px] md:w-[300px]">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60 backdrop-blur-xl">
            <div className="space-y-2 p-3">
              {(['relationship-documented', 'context-no-relationship', 'occurrence-only'] as CompletenessTier[]).map(
                (t) => {
                  const copy = TIER_COPY[t];
                  return (
                    <div key={t} className="flex gap-2.5">
                      <span
                        className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: copy.tone }}
                      />
                      <div className="min-w-0">
                        <p className="text-[12px] leading-[1.4] text-white/85">{copy.known}</p>
                        <p className="text-[11px] leading-[1.45] text-white/45">{copy.missing}</p>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
            <p className="border-t border-white/10 px-3 py-2.5 text-[11px] leading-[1.55] text-[#d8b24c]">
              {TIER_COPY['context-no-relationship'].caution}
            </p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Where: place picker                                               */}
      {/* ---------------------------------------------------------------- */}
      <div className="pointer-events-auto absolute right-4 top-24 z-20 w-[260px] max-w-[calc(100vw-2rem)] md:top-28">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/55 backdrop-blur-xl">
          <div className="space-y-2.5 p-3">
            <label className="block">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/45">
                Genus
              </span>
              <select
                value={genus ?? ''}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setGenus(v);
                  setCountry(null);
                  setSelectedId(null);
                  goToScale(v ? 'world' : 'earth', v ? points.filter((p) => p.genus === v) : points);
                }}
                className="mt-1 min-h-[44px] w-full rounded-md border border-white/12 bg-black/50 px-2.5 text-[13px] text-white focus:border-[#7fc49a]/60 focus:outline-none"
              >
                <option value="">All genera in the Atlas</option>
                {genera.map(([g, n]) => (
                  <option key={g} value={g} className="bg-black">
                    {g} ({n})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/45">
                Country
              </span>
              <select
                value={country ?? ''}
                onChange={(e) => chooseCountry(e.target.value || null)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-white/12 bg-black/50 px-2.5 text-[13px] text-white focus:border-[#7fc49a]/60 focus:outline-none"
              >
                <option value="">Everywhere with records</option>
                {countries.map(([c, n]) => (
                  <option key={c} value={c} className="bg-black">
                    {c} ({n})
                  </option>
                ))}
              </select>
            </label>

            {scale !== 'earth' && (
              <button
                type="button"
                onClick={() => goToScale(ascend(scale), selection)}
                className="min-h-[40px] w-full rounded-md border border-white/12 text-[12px] text-white/70 transition-colors hover:border-white/35 hover:text-white"
              >
                ↑ Pull back to {SCALES[ascend(scale)].label}
              </button>
            )}
          </div>

          <div className="border-t border-white/10 px-3 py-2.5">
            <p className="text-[11.5px] leading-[1.55] text-white/60">
              {aggregated ? (
                <>
                  {cells.length} cells · {context.visible.records} records ·{' '}
                  {context.visible.species} species
                </>
              ) : (
                <>
                  {context.visible.records} records · {context.visible.species} species ·{' '}
                  {context.visible.countries} countries
                </>
              )}
            </p>
            {/* Two different reasons produce a ring, and a viewer who cannot tell
                them apart learns the wrong thing from the same mark. */}
            {protectedCount > 0 && (
              <p className="mt-1.5 text-[11px] leading-[1.5] text-[#d8b24c]">
                {protectedCount.toLocaleString()} record{protectedCount === 1 ? ' is' : 's are'}{' '}
                shown as an area because the species is assessed as threatened and its precise site
                is withheld.
              </p>
            )}
            {impreciseCount > 0 && (
              <p className="mt-1.5 text-[11px] leading-[1.5] text-[#d8b24c]">
                {impreciseCount.toLocaleString()} record{impreciseCount === 1 ? ' is' : 's are'}{' '}
                shown as an area because the source states a large coordinate uncertainty — nothing
                is being withheld there; the record was never precise.
              </p>
            )}
            {!aggregated && context.visible.records > MAX_DRAWN && (
              <p className="mt-1.5 text-[11px] leading-[1.5] text-[#d87a4c]">
                Drawing the first {MAX_DRAWN.toLocaleString()} of{' '}
                {context.visible.records.toLocaleString()} records at this scale. Narrow the
                selection, or pull back to see all of them counted together.
              </p>
            )}
            {data.kind === 'ready' && !data.complete && (
              <p className="mt-1.5 text-[11px] leading-[1.5] text-[#7fa8d8]">
                Still reading the store — these counts describe what has arrived so far,
                not the whole Atlas.
              </p>
            )}
            {gapMode && (
              <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                {gapSentences(gapProfile)
                  .slice(0, 4)
                  .map((line, i) => (
                    <p key={i} className="text-[11.5px] leading-[1.5] text-white/65">
                      {line}
                    </p>
                  ))}
              </div>
            )}
            {wantsRegional && !mapbox.configured && (
              <p className="mt-1.5 text-[11px] leading-[1.5] text-[#9dc0e0]">
                Regional scales need a map provider. Set{' '}
                <span className="font-mono">{mapbox.envVar}</span> to the existing Mapbox public
                token and this rung opens; the globe holds until then.
              </p>
            )}
            <p className="mt-1.5 text-[11px] leading-[1.5] text-white/35">
              {aggregated
                ? 'A cell is a count of records in a square of the graticule. It is not a range or a density.'
                : 'Each mark is one record. A ring shows the area a generalised record lies somewhere within.'}
            </p>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Load states                                                       */}
      {/* ---------------------------------------------------------------- */}
      {data.kind !== 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-center px-6">
          <div className="max-w-md rounded-xl border border-white/12 bg-black/75 px-5 py-4 text-center backdrop-blur">
            {data.kind === 'loading' && (
              <p className="text-[13.5px] text-white/75">Reading the occurrence store…</p>
            )}
            {data.kind === 'empty' && (
              <p className="text-[13.5px] leading-[1.6] text-white/75">
                The occurrence store returned no usable coordinates. Nothing is drawn, because
                drawing something here would be an invention.
              </p>
            )}
            {data.kind === 'unavailable' && (
              <>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#8b9487]">
                  Unavailable
                </p>
                <p className="mt-1.5 text-[13.5px] leading-[1.6] text-white/75">
                  The occurrence store could not be reached. This is a connection problem — it says
                  nothing about where these orchids grow.
                </p>
                <p className="mt-2 font-mono text-[10.5px] text-white/35">{data.detail}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hover readout, pointer devices only */}
      {hover && (
        <div
          className="pointer-events-none absolute z-40 max-w-[240px] rounded-md border border-white/20 bg-black/85 px-2.5 py-1.5 text-[11.5px] text-white/85 backdrop-blur"
          style={{ left: hover.x + 16, top: hover.y + 16 }}
        >
          {hover.text}
        </div>
      )}

      {/* Selected record. A bottom sheet until there is genuinely room beside the
          globe: at 820px — iPad portrait — a 390px side panel takes half the
          world away, so the sheet holds until the large breakpoint. */}
      {selectedPoint && (
        <div className="absolute inset-x-0 bottom-0 z-40 h-[62dvh] lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:w-[390px]">
          <OccurrenceCard point={selectedPoint} access={ACCESS} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Guided investigation                                              */}
      {/* ---------------------------------------------------------------- */}
      {investigation && guideStep && (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-40 md:inset-x-auto md:left-24 md:w-[420px]">
          {(() => {
            const step = investigation.steps.find((x) => x.id === guideStep);
            if (!step) return null;
            return (
              <GuidePanel
                investigation={investigation}
                step={step}
                onClose={() => setGuideStep(null)}
                onChoose={(to) => {
                  if (to === 'exit') return setGuideStep(null);
                  if (to === 'research') {
                    setShowContext(true);
                    return setGuideStep(null);
                  }
                  // A step's map action is part of the step, so following the
                  // guide moves the Atlas rather than narrating over a still map.
                  const next = investigation.steps.find((x) => x.id === to);
                  if (next && next.mapAction.question !== question) {
                    setQuestion(next.mapAction.question);
                  }
                  setGuideStep(to);
                }}
              />
            );
          })()}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Calyx context inspector — the state a guide would receive          */}
      {/* ---------------------------------------------------------------- */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2 md:bottom-6">
        {investigation && !guideStep && (
          <button
            type="button"
            onClick={() => setGuideStep('range')}
            className="min-h-[40px] rounded-full border border-[#b98ce0]/35 bg-[#b98ce0]/10 px-4 text-[12px] text-[#e8e6df] backdrop-blur transition-colors hover:border-[#b98ce0]/70 hover:bg-[#b98ce0]/20"
          >
            What do we know about this range?
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowContext((v) => !v)}
          className="min-h-[40px] rounded-full border border-white/15 bg-black/55 px-3.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/60 backdrop-blur transition-colors hover:border-white/40 hover:text-white"
        >
          {showContext ? 'Hide' : 'Show'} Atlas context
        </button>
        {showContext && (
          <div className="mt-2 max-h-[46dvh] w-[min(420px,calc(100vw-2rem))] overflow-auto rounded-xl border border-white/12 bg-black/85 p-3 backdrop-blur-xl">
            <p className="mb-2 text-[11px] leading-[1.55] text-white/50">
              This is the grounded state a Calyx guide would be handed. It carries evidence states
              and the locality policy in force, so a guide can decline rather than improvise. Not
              wired to any conversation in this slice.
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.5] text-[#a9e0c0]">
              {JSON.stringify(context, null, 1)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default AtlasNextShell;
