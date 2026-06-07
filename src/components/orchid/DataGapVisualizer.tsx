import React from 'react';

/**
 * DataGapVisualizer
 *
 * A six-dimension readout of how completely a representative slice of
 * orchid species is known across the Continuum's primary intelligence
 * layers. Each row stacks the dimension's coverage bar against the
 * still-unknown bar, communicating where the work remains.
 *
 * Editorial styling — cream background, gold rule, IBM Plex Mono labels,
 * Playfair numerals. Values are illustrative until the live API exposes
 * a per-dimension completeness endpoint.
 */
type Row = {
  key: string;
  label: string;
  blurb: string;
  coverage: number; // percent 0..100
};

const ROWS: Row[] = [
  { key: 'tax',  label: 'Taxonomy',                blurb: 'Accepted name, synonyms, authorship',     coverage: 92 },
  { key: 'occ',  label: 'Occurrence',              blurb: 'Documented sightings & specimens',         coverage: 41 },
  { key: 'lit',  label: 'Literature',              blurb: 'Papers parsed for protocols & ecology',    coverage: 28 },
  { key: 'myc',  label: 'Mycorrhizal',             blurb: 'Required fungal partners identified',      coverage: 9  },
  { key: 'iucn', label: 'Conservation Assessment', blurb: 'IUCN status formally evaluated',           coverage: 6  },
  { key: 'proj', label: 'Project Registered',      blurb: 'Active recovery or stewardship project',   coverage: 3  },
];

const DataGapVisualizer: React.FC = () => {
  return (
    <section id="data-gaps" className="relative bg-cream border-t border-quiet">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-28">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <header className="lg:col-span-4">
            <div className="label-eyebrow">The Knowledge Map</div>
            <h2 className="mt-6 font-display text-4xl lg:text-5xl leading-[1.08] text-ink">
              Where the orchid<br />
              <span className="italic text-forest">record breaks down.</span>
            </h2>
            <div className="rule-gold" />
            <p className="mt-7 font-body text-base text-charcoal/85 leading-relaxed max-w-sm">
              We are well-named, partially observed, and almost entirely
              unstudied. The Continuum exists to close the right-hand side
              of this chart — one species, one habitat, one partnership at
              a time.
            </p>
            <div className="mt-8 flex items-center gap-6 font-mono text-[10px] tracking-[0.22em] uppercase">
              <div className="flex items-center gap-2 text-forest">
                <span className="block w-3 h-3 rounded-sm bg-[#1f3d2b]" />
                Known
              </div>
              <div className="flex items-center gap-2 text-charcoal/55">
                <span className="block w-3 h-3 rounded-sm bg-[#e7dfd1]" />
                Unknown
              </div>
            </div>
          </header>

          <div className="lg:col-span-8">
            <div className="bg-warm-white border border-quiet rounded-sm">
              <div className="px-7 py-5 border-b border-quiet flex items-baseline justify-between">
                <div className="font-display text-lg text-ink">Coverage across six intelligence layers</div>
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/55">
                  Illustrative · global slice
                </div>
              </div>
              <ul className="divide-y divide-[#e7dfd1]">
                {ROWS.map(r => (
                  <li key={r.key} className="px-7 py-6">
                    <div className="flex items-baseline justify-between gap-6">
                      <div>
                        <div className="font-display text-lg text-ink">{r.label}</div>
                        <div className="font-body text-sm text-charcoal/70 mt-1">{r.blurb}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display text-3xl text-gold tabular-nums leading-none">
                          {r.coverage}<span className="text-xl">%</span>
                        </div>
                        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/55 mt-1">
                          covered
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 h-2 w-full bg-[#e7dfd1] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1f3d2b] rounded-full transition-all"
                        style={{ width: `${r.coverage}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-5 font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/55">
              The gap on the right is the work ahead — and the case for
              every project, partner, and contributor on the platform.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DataGapVisualizer;
