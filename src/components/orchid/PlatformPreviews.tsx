import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PawPrint,
  Gauge,
  Boxes,
  ArrowRight,
  Sparkles,
  Thermometer,
  Code2,
} from 'lucide-react';
import { FEATURES } from '@/lib/api';

/**
 * Homepage preview band linking out to the three deeper modules that
 * live on their own routes — Orchid Zoo (citizen science), OACS
 * (greenhouse telemetry), and the embeddable Widget ecosystem.
 *
 * Atlas + Species already get full sections elsewhere on the homepage,
 * so this component intentionally focuses on the remaining trio so the
 * landing page reads as the full platform without duplicating content.
 */
type Preview = {
  key: string;
  enabled: boolean;
  title: string;
  tag: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  cta: string;
  bullets: { icon: React.ComponentType<{ className?: string }>; text: string }[];
};

const PlatformPreviews: React.FC = () => {
  const navigate = useNavigate();

  const previews: Preview[] = [
    {
      key: 'zoo',
      enabled: FEATURES.orchidZoo,
      title: 'Orchid Zoo',
      tag: 'Citizen Science',
      body: 'A reviewer-mediated participation network where the public helps validate identifications and surface knowledge gaps — designed to interoperate with Zooniverse / Panoptes workflows.',
      icon: PawPrint,
      route: '/zoo',
      cta: 'Open the reviewer workflow',
      bullets: [
        { icon: Sparkles, text: 'Agree / flag / skip queue' },
        { icon: Sparkles, text: 'Confidence + expert escalation' },
        { icon: Sparkles, text: 'Educational glossary tooltips' },
      ],
    },
    {
      key: 'oacs',
      enabled: FEATURES.oacs,
      title: 'OACS',
      tag: 'Environmental Monitoring',
      body: 'Orchid Adaptive Cultivation Sensors — greenhouse telemetry compared against habitat envelopes. Built for SensorPush, PAR/DLI, VPD, and a future lending sensor network for institutional partners.',
      icon: Gauge,
      route: '/oacs',
      cta: 'Open the OACS dashboard',
      bullets: [
        { icon: Thermometer, text: 'Temp · RH · PAR · VPD · CO₂' },
        { icon: Thermometer, text: 'Habitat vs greenhouse comparison' },
        { icon: Thermometer, text: 'Distributed telemetry placeholder' },
      ],
    },
    {
      key: 'widgets',
      enabled: true,
      title: 'Widget Ecosystem',
      tag: 'Embeddable',
      body: 'Six reusable cards drop the Continuum into any partner site: Species Snapshot, Orchid of the Day, Atlas Teaser, Ecological Interaction Card, Zoo Review Card, and OACS Greenhouse Snapshot.',
      icon: Boxes,
      route: '/widgets',
      cta: 'Browse the widget gallery',
      bullets: [
        { icon: Code2, text: 'Drop-in iframe-ready cards' },
        { icon: Code2, text: 'Themed for partner sites' },
        { icon: Code2, text: 'Driven by the same typed API' },
      ],
    },
  ];

  return (
    <section
      id="platform"
      className="relative py-28 bg-[#f4f1e8] border-t border-[#1a3a2e]/10"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
          <div className="max-w-2xl">
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-800/70 mb-4">
              Platform Modules
            </div>
            <h2 className="font-serif text-4xl md:text-5xl text-[#1a3a2e] leading-tight">
              Citizen science, greenhouse telemetry,<br />
              <span className="italic">and embeddable intelligence.</span>
            </h2>
          </div>
          <p className="text-[#4a4238]/80 max-w-md leading-relaxed">
            Each module lives on its own route, but they share one typed API
            surface and one design system — so a partner can adopt a single
            widget or the whole platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1a3a2e]/15 border border-[#1a3a2e]/15 rounded-2xl overflow-hidden">
          {previews.map(p => {
            const Icon = p.icon;
            return (
              <div
                key={p.key}
                className="group bg-[#f4f1e8] hover:bg-white p-8 flex flex-col transition-colors duration-500 relative"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-[#1a3a2e]/5 border border-[#1a3a2e]/10 flex items-center justify-center group-hover:bg-[#1a3a2e] transition-colors">
                    <Icon className="h-5 w-5 text-[#1a3a2e] group-hover:text-emerald-200 transition-colors" />
                  </div>
                  <span
                    className={
                      'text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border ' +
                      (p.enabled
                        ? 'border-emerald-700/30 text-emerald-800 bg-emerald-700/5'
                        : 'border-[#4a4238]/30 text-[#4a4238]/60 bg-[#4a4238]/5')
                    }
                  >
                    {p.enabled ? 'Live module' : 'Flag disabled'}
                  </span>
                </div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-[#4a4238]/60 mb-2">
                  {p.tag}
                </div>
                <h3 className="font-serif text-2xl text-[#1a3a2e] mb-3">
                  {p.title}
                </h3>
                <p className="text-sm text-[#4a4238]/80 leading-relaxed mb-5">
                  {p.body}
                </p>
                <ul className="space-y-2 mb-6">
                  {p.bullets.map((b, i) => {
                    const I = b.icon;
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-xs text-[#4a4238]/75"
                      >
                        <I className="h-3 w-3 text-emerald-700/70" />
                        {b.text}
                      </li>
                    );
                  })}
                </ul>
                <button
                  onClick={() => navigate(p.route)}
                  className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-[#1a3a2e] group-hover:text-emerald-800 transition-colors"
                >
                  {p.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PlatformPreviews;
