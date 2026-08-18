import React, { useEffect, useMemo, useState } from 'react';
import {
  loadDependencyBundle,
  PUBLIC_GRID_LABEL,
  type DependencyBundle,
  type Epistemic,
} from './dependencyData';

/**
 * Protected prototype — issue #163 dependency slice.
 *
 * Proves one chain end to end:
 *   real orchid -> published fungal dependency -> user perturbation ->
 *   visible downstream consequence on the map -> provenance.
 *
 * Not linked from the public homepage. Mounted at /prototype/dependency.
 */

type Mode = 'with' | 'without';

const INK = '#E8E6DF';
const INK_SOFT = '#A2AA9E';
const GROUND = '#111814';
const PANEL = '#18211B';
const RULE = '#2B352E';
const VIOLET = '#B98CE0'; // peloton stain / fungal partner
const GREEN = '#7FC49A'; // living orchid tissue
const AMBER = '#D8B24C';
const STALL = '#8A6C6C';

// ── epistemic chip ──────────────────────────────────────────────────────────

const EPI_STYLE: Record<Epistemic, { label: string; fg: string; bg: string }> = {
  observed: { label: 'Observed', fg: '#7FC49A', bg: 'rgba(127,196,154,0.14)' },
  inferred: { label: 'Inferred', fg: '#D8B24C', bg: 'rgba(216,178,76,0.14)' },
  unknown: { label: 'Unknown', fg: '#9BA6C9', bg: 'rgba(155,166,201,0.16)' },
};

const Chip: React.FC<{ kind: Epistemic; children?: React.ReactNode }> = ({ kind, children }) => {
  const s = EPI_STYLE[kind];
  return (
    <span
      style={{
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.fg}44`,
        borderRadius: 3,
        padding: '2px 7px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        whiteSpace: 'nowrap',
      }}
    >
      {children ?? s.label}
    </span>
  );
};

// ── anatomy: root cross-section with pelotons ───────────────────────────────

/**
 * A schematic transverse section of an orchid root. Cortical cells are drawn as
 * a ring; in the colonized state some cells contain pelotons — the coiled
 * hyphal masses that are the actual site of nutrient transfer. This is the
 * biological structure, not a node-link abstraction.
 */
const RootSection: React.FC<{ colonized: boolean; reduced: boolean }> = ({ colonized, reduced }) => {
  const cells = useMemo(() => {
    const out: Array<{ x: number; y: number; r: number; peloton: boolean }> = [];
    const rings = [
      { radius: 58, count: 14, r: 12, peloton: true },
      { radius: 34, count: 9, r: 11, peloton: false },
    ];
    rings.forEach((ring, ri) => {
      for (let i = 0; i < ring.count; i += 1) {
        const a = (i / ring.count) * Math.PI * 2 + ri * 0.22;
        out.push({
          x: 100 + Math.cos(a) * ring.radius,
          y: 100 + Math.sin(a) * ring.radius,
          r: ring.r,
          peloton: ring.peloton && i % 2 === 0,
        });
      }
    });
    return out;
  }, []);

  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" role="img"
      aria-label={colonized
        ? 'Orchid root cross-section with fungal pelotons coiled inside cortical cells'
        : 'Orchid root cross-section with empty cortical cells and no fungal pelotons'}>
      {/* velamen / outer layer */}
      <circle cx="100" cy="100" r="82" fill="none" stroke={RULE} strokeWidth="1.5" />
      <circle cx="100" cy="100" r="76" fill="none" stroke={RULE} strokeWidth="0.75" />
      {/* stele */}
      <circle cx="100" cy="100" r="17" fill="none" stroke={GREEN} strokeWidth="1.25" opacity="0.75" />
      <circle cx="100" cy="100" r="7" fill={GREEN} opacity="0.28" />

      {cells.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={c.r} fill="none" stroke={GREEN} strokeWidth="1" opacity="0.55" />
          {colonized && c.peloton && (
            <path
              d={spiral(c.x, c.y, c.r - 3.2)}
              fill="none"
              stroke={VIOLET}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.95"
              style={
                reduced
                  ? undefined
                  : { animation: `pel 700ms ease-out ${i * 32}ms both` }
              }
            />
          )}
        </g>
      ))}
      <style>{`@keyframes pel{from{opacity:0;transform:scale(.55);transform-origin:center}to{opacity:.95;transform:scale(1)}}`}</style>
    </svg>
  );
};

/** Archimedean spiral approximating a peloton coil. */
function spiral(cx: number, cy: number, maxR: number): string {
  const pts: string[] = [];
  const turns = 2.6;
  const steps = 44;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * turns * Math.PI * 2;
    const r = (i / steps) * maxR;
    pts.push(`${(cx + Math.cos(t) * r).toFixed(2)},${(cy + Math.sin(t) * r).toFixed(2)}`);
  }
  return `M${pts.join(' L')}`;
}

// ── anatomy: germination sequence ───────────────────────────────────────────

const Germination: React.FC<{ colonized: boolean }> = ({ colonized }) => {
  const stages = [
    { label: 'Seed', sub: 'dust-sized, no endosperm' },
    { label: 'Protocorm', sub: colonized ? 'fungal carbon received' : 'not reached' },
    { label: 'Seedling', sub: colonized ? 'first leaf, photosynthesis begins' : 'not reached' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {stages.map((s, i) => {
        const reached = colonized || i === 0;
        return (
          <div
            key={s.label}
            style={{
              border: `1px solid ${reached ? RULE : '#2A2020'}`,
              background: reached ? 'rgba(127,196,154,0.05)' : 'rgba(138,108,108,0.07)',
              borderRadius: 6,
              padding: '10px 10px 12px',
              transition: 'background 320ms ease, border-color 320ms ease',
            }}
          >
            <svg viewBox="0 0 60 54" width="100%" height="52" aria-hidden="true">
              {i === 0 && <ellipse cx="30" cy="30" rx="4.5" ry="2.6" fill={reached ? GREEN : STALL} />}
              {i === 1 &&
                (reached ? (
                  <>
                    <ellipse cx="30" cy="32" rx="11" ry="9" fill={GREEN} opacity="0.5" />
                    <path d={spiral(30, 32, 6)} fill="none" stroke={VIOLET} strokeWidth="1.3" />
                  </>
                ) : (
                  <ellipse cx="30" cy="32" rx="11" ry="9" fill="none" stroke={STALL} strokeWidth="1.2" strokeDasharray="3 3" />
                ))}
              {i === 2 &&
                (reached ? (
                  <>
                    <path d="M30 46 L30 22" stroke={GREEN} strokeWidth="2" strokeLinecap="round" />
                    <path d="M30 26 C20 20 17 12 27 15 C31 17 31 22 30 26 Z" fill={GREEN} opacity="0.75" />
                    <path d="M30 30 C40 25 44 16 34 19 C30 21 30 26 30 30 Z" fill={GREEN} opacity="0.55" />
                  </>
                ) : (
                  <path d="M30 46 L30 30" stroke={STALL} strokeWidth="1.2" strokeDasharray="3 3" strokeLinecap="round" />
                ))}
            </svg>
            <div style={{ fontSize: 12, fontWeight: 600, color: reached ? INK : STALL, marginTop: 2 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: reached ? INK_SOFT : STALL, lineHeight: 1.35 }}>{s.sub}</div>
          </div>
        );
      })}
    </div>
  );
};

// ── the map ─────────────────────────────────────────────────────────────────

const BOUNDS = { minLng: -102, maxLng: -55, minLat: 8, maxLat: 30 };

const OccurrenceMap: React.FC<{ bundle: DependencyBundle; mode: Mode }> = ({ bundle, mode }) => {
  const W = 640;
  const H = 300;
  const project = (lat: number, lng: number) => ({
    x: ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * W,
    y: H - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H,
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: 'block', borderRadius: 6 }}
      role="img" aria-label="Generalized occurrence positions for Vanilla planifolia, shaded by whether the fungal partner has been surveyed">
      <rect width={W} height={H} fill="#0D1411" />
      {/* graticule */}
      {[-100, -90, -80, -70, -60].map((lng) => {
        const { x } = project(0, lng);
        return <line key={lng} x1={x} y1={0} x2={x} y2={H} stroke={RULE} strokeWidth="0.5" opacity="0.7" />;
      })}
      {[10, 15, 20, 25, 30].map((lat) => {
        const { y } = project(lat, 0);
        return (
          <g key={lat}>
            <line x1={0} y1={y} x2={W} y2={y} stroke={RULE} strokeWidth="0.5" opacity="0.7" />
            <text x={5} y={y - 4} fill={INK_SOFT} fontSize="9" fontFamily="ui-monospace, monospace" opacity="0.6">
              {lat}°N
            </text>
          </g>
        );
      })}

      {bundle.occurrences.map((p) => {
        const { x, y } = project(p.lat, p.lng);
        const surveyed = p.partnerEvidence === 'observed';
        // Without the partner, no point can recruit. Surveyed points are shown
        // as a confirmed loss; unsurveyed points are shown as indeterminate,
        // because we do not know which fungi are present there.
        const fill = mode === 'with' ? (surveyed ? GREEN : '#9BA6C9') : surveyed ? STALL : '#5A6070';
        return (
          <g key={p.id} style={{ transition: 'opacity 320ms ease' }} opacity={mode === 'with' ? 1 : 0.85}>
            {/* generalized-cell footprint, not a precise locality */}
            <rect
              x={x - 7}
              y={y - 7}
              width={14}
              height={14}
              fill={fill}
              opacity={mode === 'with' ? 0.2 : 0.12}
              stroke={fill}
              strokeWidth="1"
              strokeDasharray={surveyed ? undefined : '2.5 2.5'}
              rx="2"
            />
            <circle cx={x} cy={y} r={3.4} fill={fill} />
            {mode === 'without' && (
              <path
                d={`M${x - 5} ${y - 5} L${x + 5} ${y + 5} M${x + 5} ${y - 5} L${x - 5} ${y + 5}`}
                stroke={STALL}
                strokeWidth="1.4"
                strokeLinecap="round"
                opacity="0.9"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ── page ────────────────────────────────────────────────────────────────────

const DependencySlice: React.FC = () => {
  const [bundle, setBundle] = useState<DependencyBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('with');
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  useEffect(() => {
    const snapshot =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('snapshot') === '1';
    loadDependencyBundle(snapshot)
      .then(setBundle)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <Shell>
        <p style={{ color: INK }}>Prototype data could not be loaded: {error}</p>
      </Shell>
    );
  }
  if (!bundle) {
    return (
      <Shell>
        <p style={{ color: INK_SOFT }}>Loading live evidence…</p>
      </Shell>
    );
  }

  const { profile, photograph, partner, occurrences } = bundle;
  const surveyed = occurrences.filter((o) => o.partnerEvidence === 'observed').length;
  const unsurveyed = occurrences.length - surveyed;
  const colonized = mode === 'with';

  return (
    <Shell>
      {/* 1 ── the orchid */}
      <section style={{ position: 'relative', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ position: 'relative', height: 'min(48vh, 340px)', overflow: 'hidden' }}>
          {photograph ? (
            <img
              src={photograph.imageUrl}
              alt={`${photograph.scientificName} — photograph from ${photograph.sourceName}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: INK_SOFT, fontSize: 13 }}>
              No approved photograph available for this taxon.
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(10,14,11,0.15) 0%, rgba(10,14,11,0.55) 62%, rgba(10,14,11,0.92) 100%)',
            }}
          />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 clamp(16px,4vw,32px) 18px' }}>
            <h1
              style={{
                margin: 0,
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: 'clamp(1.7rem, 4.6vw, 2.9rem)',
                letterSpacing: '-0.015em',
                color: '#F4F2EC',
              }}
            >
              {profile.scientificName}{' '}
              <span style={{ fontStyle: 'normal', fontSize: '0.42em', color: INK_SOFT, letterSpacing: '0.04em' }}>
                {profile.authority}
              </span>
            </h1>
            <p style={{ margin: '6px 0 0', color: '#D6D2C7', fontSize: 'clamp(0.86rem, 1.7vw, 1rem)', maxWidth: '52ch', lineHeight: 1.45 }}>
              The only orchid grown as a crop — and {profile.conservationStatus?.toLowerCase()} in the wild.
            </p>
            {photograph && (
              <p style={{ margin: '10px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: INK_SOFT, letterSpacing: '0.02em' }}>
                Source: {photograph.sourceName}
                {photograph.license ? ` · License: ${photograph.license.toUpperCase()}` : ' · License not recorded'}
                {' · '}
                {photograph.attribution
                  ? `Photographer: ${photograph.attribution}`
                  : 'Photographer not recorded in source metadata'}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 2 ── the dependency, anatomically */}
      <section style={{ padding: 'clamp(20px,4vw,34px) clamp(16px,4vw,32px)', borderBottom: `1px solid ${RULE}` }}>
        <Eyebrow>The dependency</Eyebrow>
        <h2 style={{ margin: '10px 0 0', fontWeight: 500, fontSize: 'clamp(1.25rem,2.7vw,1.75rem)', color: INK, letterSpacing: '-0.01em' }}>
          Its seed carries no food. A fungus feeds the seedling underground.
        </h2>

        {/* the perturbation control */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', margin: '18px 0 22px' }}>
          <div role="group" aria-label="Fungal partner present or absent"
            style={{ display: 'inline-flex', border: `1px solid ${RULE}`, borderRadius: 999, overflow: 'hidden', background: PANEL }}>
            {(['with', 'without'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                style={{
                  appearance: 'none',
                  border: 0,
                  cursor: 'pointer',
                  padding: '13px 22px',
                  minHeight: 48,
                  fontSize: 13.5,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  color: mode === m ? '#10160F' : INK_SOFT,
                  background: mode === m ? (m === 'with' ? GREEN : STALL) : 'transparent',
                  transition: 'background 200ms ease, color 200ms ease',
                }}
              >
                {m === 'with' ? 'With fungal partner' : 'Without fungal partner'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12.5, color: INK_SOFT }}>
            What happens to this orchid without <em style={{ color: VIOLET, fontStyle: 'italic' }}>{partner?.fungalTaxon}</em>?
          </span>
        </div>

        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(190px, 260px) 1fr', alignItems: 'center' }}
          className="oc-anatomy">
          <div>
            <div style={{ aspectRatio: '1 / 1', maxWidth: 260 }}>
              <RootSection colonized={colonized} reduced={reduced} />
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: INK_SOFT, textAlign: 'center', lineHeight: 1.4 }}>
              Root transverse section — {colonized ? 'pelotons coiled in cortical cells' : 'cortical cells uncolonized'}
            </p>
          </div>
          <div>
            <Germination colonized={colonized} />
            <p style={{ margin: '12px 0 0', fontSize: 13, color: INK_SOFT, lineHeight: 1.55, maxWidth: '62ch' }}>
              {colonized
                ? 'Ceratobasidium isolates supported symbiotic germination of V. planifolia seed in culture. Carbon passes from fungus to protocorm through the pelotons.'
                : 'Without a germination-competent fungal partner, the seed does not progress past the seed stage. There is no endosperm to draw on.'}
            </p>
          </div>
        </div>
      </section>

      {/* 3 ── the consequence, on real ground */}
      <section style={{ padding: 'clamp(20px,4vw,34px) clamp(16px,4vw,32px)', borderBottom: `1px solid ${RULE}` }}>
        <Eyebrow>The consequence</Eyebrow>
        <h2 style={{ margin: '10px 0 14px', fontWeight: 500, fontSize: 'clamp(1.25rem,2.7vw,1.75rem)', color: INK, letterSpacing: '-0.01em' }}>
          {colonized
            ? `${occurrences.length} recorded populations — but the partner has only been surveyed at ${surveyed}.`
            : `Without the partner, none of these ${occurrences.length} populations can recruit from seed.`}
        </h2>

        <OccurrenceMap bundle={bundle} mode={mode} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', marginTop: 12, alignItems: 'center' }}>
          <Legend swatch={colonized ? GREEN : STALL} solid>
            Partner surveyed here ({surveyed}) <Chip kind="observed" />
          </Legend>
          <Legend swatch={colonized ? '#9BA6C9' : '#5A6070'}>
            Partner never surveyed here ({unsurveyed}) <Chip kind="unknown" />
          </Legend>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: INK_SOFT }}>
            Positions generalized to {PUBLIC_GRID_LABEL}
          </span>
        </div>
      </section>

      {/* 4 ── Calyx, as docent */}
      <section style={{ padding: 'clamp(20px,4vw,34px) clamp(16px,4vw,32px)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Eyebrow>Calyx</Eyebrow>
          <span style={{ fontSize: 11.5, color: INK_SOFT }}>reading this page, not a chat window</span>
        </div>

        <div style={{ marginTop: 14, border: `1px solid ${RULE}`, background: PANEL, borderRadius: 8, padding: 'clamp(14px,2.6vw,20px)' }}>
          <p style={{ margin: 0, color: INK, fontSize: 'clamp(0.92rem,1.8vw,1.02rem)', lineHeight: 1.6, maxWidth: '68ch' }}>
            {colonized ? (
              <>
                You are looking at a dependency that has been demonstrated in culture, not merely asserted.
                Fungi were isolated from <em>Vanilla</em> roots and the <em>{partner?.fungalTaxon}</em> isolates
                went on to germinate <em>V. planifolia</em> seed.
              </>
            ) : (
              <>
                The map did not change because a population died. It changed because{' '}
                <strong style={{ color: INK }}>recruitment from seed is what fails first</strong> — established vines
                can persist while no new plants replace them. That is why a fungal loss can be invisible for years.
              </>
            )}
          </p>

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <Claim kind="observed">
              <em>{partner?.fungalTaxon}</em> and <em>Tulasnella</em> were both isolated from <em>Vanilla</em> roots in
              Puerto Rico and Mexico; <em>{partner?.fungalTaxon}</em> isolates supported symbiotic seed germination.
            </Claim>
            <Claim kind="inferred">
              That wild seedlings across the range require a germination-competent partner in situ. This follows from
              orchid seed biology and the culture result — it was not measured at each population.
            </Claim>
            <Claim kind="unknown">
              Which fungi are present at the {unsurveyed} populations outside the surveyed countries. Because{' '}
              <em>Tulasnella</em> was also recovered, partner specificity here is not absolute — this species should not
              be described as depending on one fungus alone.
            </Claim>
          </div>

          {partner?.source && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${RULE}` }}>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: INK_SOFT, marginBottom: 6 }}>
                Provenance
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: INK_SOFT, lineHeight: 1.55, maxWidth: '72ch' }}>
                {partner.source.replace(/\s*https?:\/\/\S+$/, '')}{' '}
                <a
                  href="https://doi.org/10.3852/mycologia.99.4.510"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: VIOLET, textUnderlineOffset: 2 }}
                >
                  doi:10.3852/mycologia.99.4.510
                </a>
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: INK_SOFT }}>
                Occurrences: GBIF via <code style={{ fontSize: 11 }}>atlas_occurrences</code>. Photograph:{' '}
                {photograph?.sourceName} ({photograph?.license?.toUpperCase()}).
              </p>
            </div>
          )}
        </div>

        {bundle.usedCapturedSnapshot && (
          <div style={{ marginTop: 14, border: `1px solid ${AMBER}55`, background: 'rgba(216,178,76,0.08)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: AMBER, marginBottom: 4 }}>
              Data provenance notice
            </div>
            {bundle.notices.map((n) => (
              <p key={n} style={{ margin: '2px 0', fontSize: 12, color: INK_SOFT }}>{n}</p>
            ))}
          </div>
        )}
      </section>

      <style>{`
        @media (max-width: 760px) {
          .oc-anatomy { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      minHeight: '100vh',
      background: GROUND,
      color: INK,
      fontFamily: '"Spectral", Georgia, serif',
      WebkitFontSmoothing: 'antialiased',
    }}
  >
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
  </div>
);

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: VIOLET }}>
    {children}
  </div>
);

const Legend: React.FC<{ swatch: string; solid?: boolean; children: React.ReactNode }> = ({ swatch, solid, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: INK_SOFT }}>
    <span
      style={{
        width: 13,
        height: 13,
        borderRadius: 2,
        background: `${swatch}33`,
        border: `1px ${solid ? 'solid' : 'dashed'} ${swatch}`,
        flex: 'none',
      }}
    />
    {children}
  </span>
);

const Claim: React.FC<{ kind: Epistemic; children: React.ReactNode }> = ({ kind, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'start' }}>
    <Chip kind={kind} />
    <span style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.55 }}>{children}</span>
  </div>
);

export default DependencySlice;
