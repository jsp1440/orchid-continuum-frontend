import React, { useState } from 'react';
import {
  GraduationCap,
  Droplets,
  Sun,
  Microscope,
  Bug,
  Activity,
  Sprout,
  Flower2,
  BookOpen,
  ChevronRight,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';

/**
 * Education — BloomBot-powered contextual learning hub.
 *
 * Topic cards open inline glossary panels with concise scientific
 * explanations. The panels are intentionally short — they are
 * BloomBot's "first response" before linking out to deeper content.
 */

interface Topic {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  detail: string;
  category: 'environment' | 'physiology' | 'health' | 'partnership';
}

const TOPICS: Topic[] = [
  {
    key: 'vpd',
    title: 'VPD — Vapor Pressure Deficit',
    icon: Droplets,
    category: 'environment',
    summary:
      'How "thirsty" the air feels to the plant. Combines temperature and humidity into a single transpiration-driving number.',
    detail:
      'Most orchids thrive between 0.6 – 1.2 kPa during the day. Higher VPD pulls water out of leaves; lower VPD slows transpiration and risks fungal pressure. Track VPD instead of raw humidity to compare across temperatures.',
  },
  {
    key: 'par-dli',
    title: 'PAR & DLI — Light Intensity & Daily Sum',
    icon: Sun,
    category: 'environment',
    summary:
      'PAR is the rate of photosynthetically active light. DLI is the daily integrated total — the unit orchids actually respond to.',
    detail:
      'Phalaenopsis: 6 – 10 mol·m⁻²·d⁻¹. Cattleya: 15 – 25. Vanda: 25 – 40. Hitting the right DLI matters more than peak intensity — short bright bursts can equal long gentle days.',
  },
  {
    key: 'physiology',
    title: 'Orchid Physiology',
    icon: Microscope,
    category: 'physiology',
    summary:
      'Velamen-clad roots, CAM photosynthesis, pseudobulbs, and resupinate flowers — the structural toolkit of Orchidaceae.',
    detail:
      'Most epiphytic orchids run CAM photosynthesis, opening stomata at night. Velamen on aerial roots absorbs water in seconds and shields the cortex from UV. Pseudobulbs buffer drought. Understanding the toolkit explains every culture rule.',
  },
  {
    key: 'pests',
    title: 'Pests & Diseases',
    icon: Bug,
    category: 'health',
    summary:
      'Scale, mealybug, spider mite, thrips — and the bacterial / fungal blights that follow.',
    detail:
      'Most outbreaks trace back to airflow + VPD. Identify early with a hand lens. Treat scale and mealybug with horticultural oil; mites with a strong water rinse and predatory mites; bacteria with Physan and dry tissue.',
  },
  {
    key: 'metabolic',
    title: 'Metabolic Disorders',
    icon: Activity,
    category: 'health',
    summary:
      'Edema, oxalate burn, calcium-deficiency tip burn — non-pathogenic problems caused by environment.',
    detail:
      'Edema (water-blister) appears when roots take up water faster than leaves transpire. Calcium tip burn shows when transpiration is too slow to pull Ca²⁺ to leaf margins. Both are environmental tells, not infections.',
  },
  {
    key: 'mycorrhiza',
    title: 'Mycorrhiza',
    icon: Sprout,
    category: 'partnership',
    summary:
      'Every orchid seed germinates with a fungal partner. The relationship continues, often invisibly, into adulthood.',
    detail:
      'Tulasnella, Ceratobasidium, Sebacina dominate orchid associations. Specificity ranges from generalist to single-fungus dependence. In conservation, sourcing the right mycobiont can be the difference between germination and silence.',
  },
  {
    key: 'pollination',
    title: 'Pollination',
    icon: Flower2,
    category: 'partnership',
    summary:
      'Deception, reward, sexual mimicry, perfume harvesting — orchids deploy the most diverse pollination strategies of any plant family.',
    detail:
      'Roughly a third of orchid species offer no reward at all. Ophrys mimics female bees; Catasetum forcibly attaches pollinia; Coryanthes traps and bathes its visitor. The Continuum links each species to documented partners via GloBI.',
  },
];

const CATEGORY_LABEL: Record<Topic['category'], string> = {
  environment: 'Environment',
  physiology: 'Physiology',
  health: 'Plant health',
  partnership: 'Partnerships',
};

const Education: React.FC = () => {
  const [openKey, setOpenKey] = useState<string | null>('vpd');

  const grouped = TOPICS.reduce<Record<Topic['category'], Topic[]>>(
    (acc, t) => {
      (acc[t.category] ||= []).push(t);
      return acc;
    },
    {} as Record<Topic['category'], Topic[]>,
  );

  return (
    <PageShell
      eyebrow="BloomBot · contextual learning"
      title="Education"
      titleAccent="science you can use this afternoon."
      intro="Concise, growable explanations of the concepts that matter most — environment, physiology, health, and the partnerships that make orchids work."
      heroAside={
        <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-emerald-300/15 border border-emerald-300/30 flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-emerald-200" />
            </div>
            <div>
              <div className="text-sm font-medium">BloomBot</div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-emerald-300/70">
                contextual assistant
              </div>
            </div>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            BloomBot threads these explanations into species pages, the
            Atlas, and OACS readings — so the right concept appears at the
            moment you need it.
          </p>
        </div>
      }
    >
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-12">
          {(
            Object.keys(grouped) as Array<Topic['category']>
          ).map(cat => (
            <div key={cat}>
              <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/70 mb-4">
                {CATEGORY_LABEL[cat]}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {grouped[cat].map(t => {
                  const Icon = t.icon;
                  const open = openKey === t.key;
                  return (
                    <div
                      key={t.key}
                      className={
                        'rounded-2xl border bg-[#142a1f] transition-all ' +
                        (open
                          ? 'border-emerald-300/40'
                          : 'border-white/10 hover:border-white/25')
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setOpenKey(open ? null : t.key)}
                        className="w-full text-left p-5 flex items-start gap-4"
                      >
                        <div className="w-10 h-10 rounded-lg bg-emerald-300/10 border border-emerald-300/20 flex items-center justify-center text-emerald-200 shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="font-serif text-lg mb-1">
                            {t.title}
                          </div>
                          <p className="text-sm text-white/60 leading-relaxed">
                            {t.summary}
                          </p>
                        </div>
                        <ChevronRight
                          className={
                            'h-4 w-4 text-white/40 mt-2 transition-transform ' +
                            (open ? 'rotate-90 text-emerald-200' : '')
                          }
                        />
                      </button>
                      {open && (
                        <div className="px-5 pb-5 pl-[5.25rem]">
                          <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-white/75 leading-relaxed">
                            {t.detail}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 border-t border-white/5 bg-[#0a1812]">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
          <BookOpen className="h-6 w-6 text-emerald-300 mx-auto mb-4" />
          <h2 className="font-serif text-2xl md:text-3xl mb-3">
            Glossary continues to grow.
          </h2>
          <p className="text-sm text-white/60 leading-relaxed">
            BloomBot's knowledge base is versioned alongside the Continuum.
            Suggest a topic through{' '}
            <a
              href="/get-involved"
              className="text-emerald-200 hover:underline"
            >
              Get Involved
            </a>
            .
          </p>
        </div>
      </section>
    </PageShell>
  );
};

export default Education;
