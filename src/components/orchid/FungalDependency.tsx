import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import {
  fetchFungalEvidence,
  splitCitation,
  type FungalEvidence,
} from '@/lib/fungalPartner';

/**
 * FungalDependency — HOMEPAGE-SLICE-1, the single relationship section.
 *
 * Answers a human question — "What feeds this orchid before it can feed
 * itself?" — rather than presenting a category called "Mycorrhizae".
 *
 * The section renders whatever the graph actually holds for the featured
 * orchid, in one of three states:
 *
 *   species     — a study names this exact species' fungal partner
 *   genus       — a study names a partner for a different species in the genus,
 *                 shown as such and never promoted to the featured species
 *   unrecorded  — the graph holds no partner for this genus, which is stated
 *                 with the real scale of the gap rather than filled in with
 *                 general orchid biology
 *
 * Six of the eight genera in the homepage rotation are currently unrecorded,
 * so the third state is the ordinary case, not an error path.
 */

interface Props {
  /** Species the hero settled on, when the photograph named one. */
  heroSpecies: string | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; evidence: FungalEvidence }
  | { kind: 'unavailable' };

/** Cortical cells in transverse section; coils appear only where evidence does. */
const RootSection: React.FC<{ colonised: boolean }> = ({ colonised }) => {
  const cells = React.useMemo(() => {
    const out: Array<{ x: number; y: number; r: number; coil: boolean }> = [];
    [
      { radius: 56, count: 13, r: 12, coil: true },
      { radius: 33, count: 8, r: 10.5, coil: false },
    ].forEach((ring, ri) => {
      for (let i = 0; i < ring.count; i += 1) {
        const a = (i / ring.count) * Math.PI * 2 + ri * 0.24;
        out.push({
          x: 100 + Math.cos(a) * ring.radius,
          y: 100 + Math.sin(a) * ring.radius,
          r: ring.r,
          coil: ring.coil && i % 2 === 0,
        });
      }
    });
    return out;
  }, []);

  return (
    <svg
      viewBox="0 0 200 200"
      className="h-auto w-full"
      role="img"
      aria-label={
        colonised
          ? 'Orchid root in transverse section, with fungal coils inside some cortical cells'
          : 'Orchid root in transverse section, cortical cells shown without recorded fungal coils'
      }
    >
      <circle cx="100" cy="100" r="84" fill="none" stroke="#33402f" strokeWidth="1.4" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="#33402f" strokeWidth="0.7" />
      <circle cx="100" cy="100" r="16" fill="none" stroke="#7fb98e" strokeWidth="1.2" opacity="0.7" />
      <circle cx="100" cy="100" r="6" fill="#7fb98e" opacity="0.25" />
      {cells.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={c.r} fill="none" stroke="#7fb98e" strokeWidth="0.95" opacity="0.5" />
          {colonised && c.coil && (
            <path d={coil(c.x, c.y, c.r - 3)} fill="none" stroke="#b98ce0" strokeWidth="1.45" strokeLinecap="round" opacity="0.92" />
          )}
        </g>
      ))}
    </svg>
  );
};

function coil(cx: number, cy: number, maxR: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 42; i += 1) {
    const t = (i / 42) * 2.6 * Math.PI * 2;
    const r = (i / 42) * maxR;
    pts.push(`${(cx + Math.cos(t) * r).toFixed(2)},${(cy + Math.sin(t) * r).toFixed(2)}`);
  }
  return `M${pts.join(' L')}`;
}

const ScopeBadge: React.FC<{ evidence: FungalEvidence }> = ({ evidence }) => {
  const map = {
    species: { text: 'Species-level evidence', fg: '#7fc49a', bg: 'rgba(127,196,154,0.13)' },
    genus: { text: 'Genus-level evidence', fg: '#d8b24c', bg: 'rgba(216,178,76,0.13)' },
    unrecorded: { text: 'Not recorded', fg: '#9ba6c9', bg: 'rgba(155,166,201,0.15)' },
  }[evidence.scope];
  return (
    <span
      className="inline-flex items-center rounded-[3px] px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.11em]"
      style={{ color: map.fg, background: map.bg, border: `1px solid ${map.fg}44` }}
    >
      {map.text}
    </span>
  );
};

const FungalDependency: React.FC<Props> = ({ heroSpecies }) => {
  const { genus } = useDailyGenus();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchFungalEvidence(genus, heroSpecies)
      .then((evidence) => {
        if (!cancelled) setState({ kind: 'ready', evidence });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [genus, heroSpecies]);

  const evidence = state.kind === 'ready' ? state.evidence : null;
  const documented = evidence?.scope === 'species' || evidence?.scope === 'genus';
  const citation = splitCitation(evidence?.source ?? null);

  return (
    <section
      id="what-feeds-it"
      className="relative border-y border-white/[0.07] bg-[#0f1a13] text-[#e8e6df]"
      aria-label="What feeds this orchid before it can feed itself"
    >
      <div className="mx-auto max-w-[1300px] px-6 py-12 md:px-10 md:py-16">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-[#b98ce0]">
          The first dependency
        </p>

        <h2
          className="mt-3 max-w-[22ch] leading-[1.08] tracking-[-0.012em] text-[#f4f2ec]"
          style={{
            fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
            fontWeight: 500,
            fontSize: 'clamp(1.6rem, 3.4vw, 2.5rem)',
          }}
        >
          What feeds this orchid before it can feed itself?
        </h2>

        <div className="mt-9 grid items-start gap-8 md:grid-cols-[minmax(170px,230px)_1fr] md:gap-10">
          <div>
            <RootSection colonised={Boolean(documented)} />
            <p className="mt-3 text-center text-[11px] leading-5 text-[#9aa596]">
              {documented
                ? 'Root in section — fungal coils occupy cells of the outer cortex'
                : 'Root in section — no partner recorded for this genus'}
            </p>
          </div>

          <div>
            {state.kind === 'loading' && (
              <p className="text-[15px] leading-7 text-[#9aa596]">Checking the evidence for {genus}…</p>
            )}

            {state.kind === 'unavailable' && (
              <p className="max-w-[58ch] text-[15px] leading-7 text-[#9aa596]">
                The relationship record could not be reached just now, so nothing is claimed here. This is a
                connection problem, not a statement about the orchid.
              </p>
            )}

            {evidence && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <ScopeBadge evidence={evidence} />
                  {evidence.scope === 'genus' && evidence.evidenceSpecies && (
                    <span className="text-[12.5px] text-[#9aa596]">
                      recorded for <em className="italic text-[#ddd8cc]">{evidence.evidenceSpecies}</em>, not the
                      orchid above
                    </span>
                  )}
                </div>

                {documented ? (
                  <>
                    <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.65] text-[#ddd8cc] md:text-[17px]">
                      An orchid seed is dust — it carries almost no food of its own. For{' '}
                      <em className="italic">{evidence.evidenceSpecies}</em>, the fungus recorded as feeding the
                      seedling underground is{' '}
                      <em className="italic text-[#c9a3ea]">{evidence.fungalTaxon}</em>
                      {evidence.fungalFamily ? ` (${evidence.fungalFamily})` : ''}.
                    </p>

                    {evidence.note && (
                      <p className="mt-4 max-w-[62ch] border-l border-[#b98ce0]/35 pl-4 text-[13.5px] leading-[1.6] text-[#9aa596]">
                        {evidence.note}
                      </p>
                    )}

                    {evidence.scope === 'genus' && (
                      <p className="mt-4 max-w-[58ch] text-[13.5px] leading-[1.6] text-[#d8b24c]">
                        This partnership is documented for another species in the genus. Whether the orchid
                        pictured above uses the same fungus has not been recorded here.
                      </p>
                    )}

                    {citation.text && (
                      <p className="mt-5 max-w-[68ch] text-[12px] leading-[1.6] text-[#8b9487]">
                        {citation.text}{' '}
                        {citation.url && (
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#b98ce0] underline underline-offset-2"
                          >
                            {citation.url.replace('https://doi.org/', 'doi:')}
                          </a>
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.65] text-[#ddd8cc] md:text-[17px]">
                      Nobody has recorded it here yet.
                    </p>
                    <p className="mt-4 max-w-[60ch] text-[14.5px] leading-[1.7] text-[#9aa596]">
                      The Continuum holds documented fungal partners for{' '}
                      {evidence.totalDocumentedSpecies ?? 'a small number of'} orchid species worldwide.{' '}
                      <em className="italic text-[#ddd8cc]">{evidence.genus}</em> is not among them — so the
                      question above has no answer in this graph, for any species in the genus.
                    </p>
                    <p className="mt-4 max-w-[60ch] text-[13.5px] leading-[1.6] text-[#8b9487]">
                      That gap is the finding. It is not evidence that the orchid lacks a partner.
                    </p>
                  </>
                )}

                <div className="mt-7">
                  <Link
                    to="/mycorrhizae"
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-[#b98ce0]/30 px-5 text-[13px] text-[#e8e6df] transition-colors hover:border-[#b98ce0]/70 hover:bg-[#b98ce0]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b98ce0]"
                  >
                    {documented ? 'Follow the fungus →' : 'See what has been recorded →'}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FungalDependency;
