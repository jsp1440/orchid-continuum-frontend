import React from 'react';
import { ArrowRight } from 'lucide-react';
import ContinuumThread from '@/components/orchid/ContinuumThread';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { useHeroSpecies } from '@/lib/heroSpeciesContext';
import { FIRST_RELATIONSHIP_ANCHOR, HOME_ATLAS_ANCHOR } from '@/lib/homepageAnchors';
import {
  ORCHID_GERMINATION_DEPENDENCY,
  openQuestionFor,
  resolveMycorrhizalRelationship,
} from '@/lib/mycorrhizalRelationship';

/**
 * FungalPartnership — the first step outward from the hero orchid.
 *
 * Of everything an orchid is connected to, this is the connection that makes
 * the argument on its own: an orchid seed cannot germinate in the wild without
 * a fungus feeding it. A visitor who understands that sentence has understood
 * why a database of orchids, by itself, is not enough.
 *
 * The section holds two statements at two different scopes and never lets them
 * blur together. The germination dependency is established for Orchidaceae and
 * is labelled that way. The named fungal partners are recorded for the active
 * genus and are labelled that way, with the limits of genus-level evidence
 * stated rather than implied. When the Continuum has no record for a genus, the
 * gap is shown as a gap — an orchid whose fungi we have not identified is not
 * an orchid without fungi.
 */

/** Schematic, not a photograph, and captioned as one. */
const PelotonSchematic: React.FC = () => (
  <svg
    viewBox="0 0 120 96"
    className="h-24 w-28 shrink-0"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    {/* Neighbouring root cells, to place the one that matters. */}
    <rect x="2" y="16" width="30" height="64" rx="7" stroke="#d4b34a" strokeOpacity="0.22" />
    <rect x="88" y="16" width="30" height="64" rx="7" stroke="#d4b34a" strokeOpacity="0.22" />
    {/* The colonised cell. */}
    <rect x="34" y="10" width="52" height="76" rx="9" stroke="#d4b34a" strokeOpacity="0.55" />
    {/* Hyphae arriving from the soil. */}
    <path d="M0 40 C 12 42, 24 36, 34 40" stroke="#d4b34a" strokeOpacity="0.45" strokeLinecap="round" />
    <path d="M0 58 C 14 54, 24 62, 34 58" stroke="#d4b34a" strokeOpacity="0.3" strokeLinecap="round" />
    {/* The coil itself — a peloton. */}
    <path
      d="M40 44 C 44 26, 76 26, 76 46 C 76 66, 46 70, 44 54 C 43 44, 66 40, 66 52 C 66 60, 54 60, 53 53"
      stroke="#d4b34a"
      strokeOpacity="0.9"
      strokeLinecap="round"
    />
  </svg>
);

const FungalPartnership: React.FC = () => {
  const { genus } = useDailyGenus();
  const { heroSpecies } = useHeroSpecies();

  // Follow the individual the hero opened on where we have one; otherwise the
  // genus of the day. Either way this section and the hero describe one orchid.
  const activeGenus = heroSpecies?.genus?.trim() || genus;
  const relationship = resolveMycorrhizalRelationship(activeGenus);

  return (
    <section
      id={FIRST_RELATIONSHIP_ANCHOR}
      className="relative scroll-mt-24 border-b border-white/[0.06] bg-[#0b1710] text-[#f5f0e8]"
      aria-labelledby="first-relationship-heading"
    >
      <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10">
        {/* The thread arrives from the hero. */}
        <div className="lg:hidden">
          <ContinuumThread className="h-16" fadeTop label="The thread from the orchid above" />
        </div>

        <div className="grid pb-16 lg:grid-cols-[40px_minmax(0,1fr)] lg:gap-x-10 lg:pb-24">
          <div className="hidden lg:block">
            <ContinuumThread
              className="h-full min-h-[24rem]"
              fadeTop
              fadeBottom
              label="The thread from the orchid above, continuing past this relationship"
            />
          </div>

          <div className="max-w-3xl pt-6 lg:pt-20">
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#d4b34a]">
              The first relationship
            </div>

            <h2
              id="first-relationship-heading"
              className="mt-5 leading-[1.05] tracking-[-0.012em] text-[#fffaf0]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontWeight: 540,
                fontSize: 'clamp(2rem, 4.4vw, 3.8rem)',
              }}
            >
              It could not have started without a fungus.
            </h2>

            <div className="mt-6 max-w-2xl space-y-4 text-[16px] leading-7 text-[#d8cfbd]/90 md:text-[17px] md:leading-8">
              <p>{ORCHID_GERMINATION_DEPENDENCY.claim}</p>
              <p className="text-[#e9e0cd]">{ORCHID_GERMINATION_DEPENDENCY.consequence}</p>
            </div>

            <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-[#8a8062]">
              Established for {ORCHID_GERMINATION_DEPENDENCY.taxon}
            </p>

            {/* Where the thread thickens: what we actually hold for this genus. */}
            <div className="mt-9 max-w-2xl rounded-r-2xl border-l-2 border-[#d4b34a]/55 bg-white/[0.035] p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a]">
                  {relationship.status === 'documented'
                    ? `Recorded for ${relationship.genus}`
                    : `Not yet recorded for ${relationship.genus || 'this genus'}`}
                </div>
                <span className="rounded-full border border-[#d4b34a]/30 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc6b4]/80">
                  {relationship.status === 'documented' ? 'Genus-level evidence' : 'Knowledge gap'}
                </span>
              </div>

              {relationship.status === 'documented' ? (
                <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                  <PelotonSchematic />
                  <div>
                    <p
                      className="text-[#fffaf0]"
                      style={{
                        fontFamily: '"Cormorant Garamond","Playfair Display",Georgia,serif',
                        fontSize: 'clamp(1.3rem, 2.4vw, 1.9rem)',
                        lineHeight: 1.25,
                      }}
                    >
                      {relationship.partners}
                    </p>
                    <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8062]">
                      Schematic above: fungal coil (peloton) inside an orchid root cell
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-3 text-[15px] leading-7 text-[#d8cfbd]/85">
                  <p>{relationship.meaning}</p>
                  <p className="text-[#cfc6b4]/70">{relationship.gap}</p>
                </div>
              )}

              {relationship.status === 'documented' && (
                <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8062]">
                    Source · {relationship.provenance}
                  </p>
                  <p className="text-[13px] leading-6 text-[#cfc6b4]/70">{relationship.caveat}</p>
                </div>
              )}
            </div>

            {/* The thread does not stop here; it hands over a question. */}
            <div className="mt-10 max-w-2xl">
              <p
                className="text-[#e7dfd1]"
                style={{
                  fontFamily: '"Cormorant Garamond","Playfair Display",Georgia,serif',
                  fontSize: 'clamp(1.2rem, 2.2vw, 1.7rem)',
                  lineHeight: 1.3,
                }}
              >
                {openQuestionFor(activeGenus)}
              </p>
              <a
                href={`#${HOME_ATLAS_ANCHOR}`}
                className="group mt-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a] transition-colors hover:text-[#e6c763]"
              >
                Take the question to the map
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>

            <details className="mt-8 max-w-2xl">
              <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.2em] text-[#8a8062] transition-colors hover:text-[#d4b34a]">
                References for the germination dependency
              </summary>
              <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#cfc6b4]/70">
                {ORCHID_GERMINATION_DEPENDENCY.references.map((reference) => (
                  <li key={reference}>{reference}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FungalPartnership;
