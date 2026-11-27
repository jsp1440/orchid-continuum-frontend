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
import {
  EDUCATION_HERO_NOTE,
  EDUCATION_TOPIC_CONTENT,
  type EducationTopicContent,
} from '@/lib/educationTopics';

/**
 * Education — BloomBot-powered contextual learning hub.
 *
 * Topic cards open inline glossary panels with concise scientific
 * explanations. The panels are intentionally short — they are
 * BloomBot's "first response" before linking out to deeper content.
 */

type Topic = EducationTopicContent & {
  icon: React.ComponentType<{ className?: string }>;
};

const TOPIC_ICONS: Record<string, Topic['icon']> = {
  vpd: Droplets,
  'par-dli': Sun,
  physiology: Microscope,
  pests: Bug,
  metabolic: Activity,
  mycorrhiza: Sprout,
  pollination: Flower2,
};

const TOPICS: Topic[] = EDUCATION_TOPIC_CONTENT.map(t => ({
  ...t,
  icon: TOPIC_ICONS[t.key] ?? BookOpen,
}));

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
            {EDUCATION_HERO_NOTE}
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
