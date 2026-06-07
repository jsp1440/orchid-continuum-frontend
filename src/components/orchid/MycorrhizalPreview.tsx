import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sprout } from 'lucide-react';

/**
 * MycorrhizalPreview — "The Hidden Partnership"
 *
 * A cream editorial section that surfaces the Continuum's mycorrhizal
 * intelligence layer. A hand-drawn rhizosphere illustration anchors the
 * spread; three short stats translate "fungal dependence" into something
 * legible to growers, students, and partners.
 *
 * No fabricated database references — copy stays editorial.
 */
const stats = [
  { v: '70%',     l: 'of orchid species', s: 'depend on a specific fungal genus to germinate at all.' },
  { v: '< 9%',    l: 'have those partners identified', s: 'in the current orchid mycorrhizal literature.' },
  { v: '80M yrs', l: 'of co-evolution', s: 'underwrites every successful seedling in the wild.' },
];

const MycorrhizalPreview: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section id="mycorrhizal" className="relative bg-cream border-t border-quiet overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          {/* Illustration */}
          <div className="lg:col-span-6 order-2 lg:order-1">
            <div className="relative bg-warm-white border border-quiet rounded-sm p-8">
              <div className="absolute top-3 left-4 font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/55">
                Plate I · Rhizosphere
              </div>
              <RhizosphereSVG />
              <div className="mt-4 font-display italic text-center text-charcoal">
                Orchid protocorm in mycorrhizal embrace
              </div>
            </div>
          </div>

          {/* Copy */}
          <div className="lg:col-span-6 order-1 lg:order-2">
            <div className="label-eyebrow">Mycorrhizal Intelligence</div>
            <h2 className="mt-6 font-display text-4xl lg:text-[3rem] leading-[1.08] text-ink">
              The hidden<br />
              <span className="italic text-forest">partnership.</span>
            </h2>
            <div className="rule-gold" />
            <p className="mt-7 font-body text-lg text-charcoal/90 leading-relaxed max-w-lg">
              An orchid seed weighs less than a grain of dust and carries no
              food. To survive, it must find — within days — the precise
              fungus its lineage co-evolved with. No fungus, no orchid. Ever.
            </p>
            <p className="mt-4 font-body text-base text-charcoal/75 leading-relaxed max-w-lg">
              The Continuum maps these partnerships against species, habitat,
              and project records — so reintroduction work begins with the
              full ecological picture, not half of it.
            </p>

            <div className="mt-10 grid sm:grid-cols-3 gap-5 max-w-lg">
              {stats.map(s => (
                <div key={s.v} className="border-l-2 border-gold pl-4">
                  <div className="font-display text-2xl text-gold">{s.v}</div>
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-forest mt-1">
                    {s.l}
                  </div>
                  <div className="font-body text-sm text-charcoal/75 mt-2 leading-snug">
                    {s.s}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate('/research')}
              className="group mt-10 inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-forest text-forest hover:bg-[#1f3d2b]/5 transition-all text-sm font-medium tracking-wide"
            >
              <Sprout className="h-4 w-4" />
              <span>Open mycorrhizal intelligence</span>
              <ArrowRight className="h-4 w-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const RhizosphereSVG: React.FC = () => (
  <svg viewBox="0 0 480 320" className="w-full h-auto block">
    <g fill="none" stroke="#1f3d2b" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      {/* Soil line */}
      <path d="M0,150 C80,140 160,160 240,148 C320,138 400,158 480,148" />
      {/* Protocorm — small green pearl */}
      <g transform="translate(240,140)">
        <ellipse cx="0" cy="0" rx="18" ry="14" fill="#eadfc7" />
        <ellipse cx="0" cy="-2" rx="14" ry="10" />
        {/* Tiny leaf shoot */}
        <path d="M-2,-12 C-6,-26 6,-30 4,-44" />
        <path d="M2,-12 C8,-26 -4,-32 -2,-46" />
      </g>
      {/* Hyphal network — radiating fungal filaments */}
      <g stroke="#8b5e3c" strokeWidth="0.9">
        <path d="M240,150 C200,160 170,180 150,210" />
        <path d="M240,150 C210,170 190,200 200,240" />
        <path d="M240,150 C230,180 220,210 230,250" />
        <path d="M240,150 C260,180 280,200 290,240" />
        <path d="M240,150 C270,170 300,180 330,200" />
        <path d="M240,150 C280,160 310,175 340,210" />
        {/* sub-branching */}
        <path d="M170,180 C155,190 140,195 125,195" />
        <path d="M200,200 C195,215 185,220 170,225" />
        <path d="M280,200 C295,215 310,220 320,235" />
        <path d="M310,180 C325,195 340,200 360,200" />
        <path d="M220,210 C215,235 220,260 210,285" />
        <path d="M260,210 C265,235 260,260 270,285" />
      </g>
      {/* Hyphal swellings (pelotons inside protocorm cells) */}
      <g stroke="#8b5e3c" strokeWidth="0.8">
        <circle cx="234" cy="138" r="1.6" />
        <circle cx="240" cy="143" r="1.6" />
        <circle cx="246" cy="138" r="1.6" />
        <circle cx="240" cy="134" r="1.6" />
      </g>
      {/* Detail callouts */}
      <g stroke="#b8962a" strokeWidth="0.7" strokeDasharray="2 3">
        <path d="M260,138 L330,90" />
        <path d="M170,180 L100,230" />
      </g>
      <g fontFamily="'IBM Plex Mono', monospace" fontSize="9" letterSpacing="1.5" fill="#3a3630" stroke="none">
        <text x="332" y="86">PROTOCORM</text>
        <text x="32" y="234">HYPHAL NETWORK</text>
      </g>
    </g>
  </svg>
);

export default MycorrhizalPreview;
