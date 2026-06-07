import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Mountain,
  Droplets,
  Sun,
  Thermometer,
  Calendar,
  Leaf,
  Gauge,
} from 'lucide-react';

/**
 * OACS Reframe — species-level adaptive cultivation intelligence.
 *
 * Editorial cream presentation. Native-habitat envelope vs. grow-space
 * telemetry, paired signal-by-signal. Forest green/gold accents only;
 * background remains warm.
 */
const habitat = [
  { icon: Mountain,    label: 'Elevation',   value: '1,400 – 2,200 m',  hint: 'Andean cloud forest' },
  { icon: Thermometer, label: 'Temperature', value: '14 – 22 °C',       hint: 'Diurnal swing 8 °C' },
  { icon: Droplets,    label: 'Humidity',    value: '78 – 92 %',        hint: 'Mist saturation overnight' },
  { icon: Sun,         label: 'Light · DLI', value: '120 – 180 µmol',   hint: 'Filtered canopy light' },
  { icon: Calendar,    label: 'Seasonality', value: 'Wet Apr – Oct',    hint: 'Cool dry rest Dec – Feb' },
  { icon: Leaf,        label: 'Substrate',   value: 'Mossy branches',   hint: 'Epiphytic, well-drained' },
];

const grow = [
  { icon: Mountain,    label: 'Effective elevation',    value: 'Equivalent 1,650 m',   match: 'matched' as const },
  { icon: Thermometer, label: 'Greenhouse temperature', value: '16 – 23 °C',           match: 'matched' as const },
  { icon: Droplets,    label: 'Greenhouse humidity',    value: '62 – 74 %',            match: 'low' as const },
  { icon: Sun,         label: 'Measured DLI',           value: '95 µmol',              match: 'low' as const },
  { icon: Calendar,    label: 'Watering rhythm',        value: 'Year-round even',      match: 'mismatch' as const },
  { icon: Leaf,        label: 'Mount type',             value: 'Slab + sphagnum',      match: 'matched' as const },
];

const matchTone = {
  matched:  { dot: 'bg-[#1f3d2b]', text: 'text-forest',  label: 'Matched' },
  low:      { dot: 'bg-[#b8962a]', text: 'text-gold',    label: 'Adjust' },
  mismatch: { dot: 'bg-[#8b3a2a]', text: 'text-[#8b3a2a]', label: 'Mismatch' },
};

const OACSReframe: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section id="oacs" className="relative bg-parchment border-t border-quiet">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        {/* Narrative reframe */}
        <div className="max-w-3xl">
          <div className="label-eyebrow">Adaptive Cultivation Intelligence</div>
          <h2 className="mt-6 font-display text-4xl lg:text-[3.25rem] leading-[1.08] text-ink">
            Cultivation guidance,<br />
            <span className="italic text-forest">read from the habitat itself.</span>
          </h2>
          <div className="rule-gold" />
          <p className="font-body text-lg text-charcoal/90 mt-8 leading-relaxed">
            Traditional orchid culture sheets are usually genus-level and
            generalised — useful, but blind to the specific elevations,
            climates, and seasonalities each species evolved within.
          </p>
          <p className="font-body text-base text-charcoal/75 mt-4 leading-relaxed">
            The Continuum offers <em>species-level</em> adaptive cultivation
            intelligence — drawn from the environments orchids actually
            inhabit. Native habitat patterns are compared, in real time,
            against your grow space, your local weather, your telemetry,
            and your microclimate.
          </p>
          <div className="inline-flex items-center gap-2 mt-7 px-3 py-1.5 rounded-full border border-gold text-gold font-mono text-[10px] tracking-[0.22em] uppercase">
            <Gauge className="h-3 w-3" />
            OACS · Orchid Adaptive Cultivation System
          </div>
        </div>

        {/* Habitat ⇄ grow space comparison */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-px bg-[#e7dfd1] border border-quiet rounded-sm overflow-hidden">
          {/* Native habitat */}
          <div className="bg-warm-white p-8">
            <div className="flex items-start justify-between mb-6 gap-4">
              <div>
                <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                  Native Habitat Envelope
                </div>
                <div className="font-display text-2xl text-ink italic mt-1">
                  Masdevallia coccinea
                </div>
                <div className="font-body text-sm text-charcoal/65 mt-1">
                  Andean cloud forest · demonstration profile
                </div>
              </div>
              <span className="shrink-0 font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-forest text-forest">
                Habitat signal
              </span>
            </div>
            <ul className="space-y-3">
              {habitat.map(h => {
                const Icon = h.icon;
                return (
                  <li key={h.label} className="flex items-center gap-4 p-3 rounded-sm bg-cream border border-quiet">
                    <div className="w-9 h-9 rounded-sm bg-[#1f3d2b]/8 border border-[#1f3d2b]/15 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-forest" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-charcoal/60">{h.label}</div>
                      <div className="font-body text-sm text-ink tabular-nums">{h.value}</div>
                    </div>
                    <div className="font-body text-[12px] text-charcoal/55 italic hidden sm:block">{h.hint}</div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Grow space */}
          <div className="bg-[#faf7f2] p-8">
            <div className="flex items-start justify-between mb-6 gap-4">
              <div>
                <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                  Your Grow Space
                </div>
                <div className="font-display text-2xl text-ink mt-1">
                  Greenhouse · East Bench
                </div>
                <div className="font-body text-sm text-charcoal/65 mt-1">
                  Telemetry + local weather · last 7 days
                </div>
              </div>
              <span className="shrink-0 font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-gold text-gold">
                Telemetry signal
              </span>
            </div>
            <ul className="space-y-3">
              {grow.map((g, i) => {
                const Icon = g.icon;
                const tone = matchTone[g.match];
                return (
                  <li key={g.label} className="flex items-center gap-4 p-3 rounded-sm bg-warm-white border border-quiet">
                    <div className="w-9 h-9 rounded-sm bg-[#1f3d2b]/8 border border-[#1f3d2b]/15 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-forest" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-charcoal/60">{g.label}</div>
                      <div className="font-body text-sm text-ink tabular-nums">{g.value}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] uppercase ${tone.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot} ${i === 0 ? 'animate-pulse' : ''}`} />
                      {tone.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Adaptive interpretation panel */}
        <div className="mt-6 bg-warm-white border border-gold/40 rounded-sm p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
              Adaptive Interpretation
            </div>
            <p className="font-body text-base text-charcoal/90 leading-relaxed">
              Two of six signals are drifting from the species' native envelope.
              The Continuum suggests raising humidity into the 75 – 85 % range
              overnight and shifting toward a cool dry rest in late autumn —
              mirroring the orchid's wild seasonality rather than a generic
              year-round regime.
            </p>
          </div>
          <div className="flex flex-col justify-end">
            <button
              onClick={() => navigate('/oacs')}
              className="group inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-all text-sm font-medium tracking-wide"
            >
              Open the OACS dashboard
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/55 text-center mt-3">
              Demonstration · live telemetry once paired
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OACSReframe;
