import React from 'react';
import {
  GraduationCap,
  Leaf,
  BookOpen,
  Users,
  Building2,
  University,
  TreePine,
  Microscope,
} from 'lucide-react';

/**
 * Combined "Conservation & Education" + "Partners / Institutions"
 * homepage section. Lightweight and mostly typographic — the platform's
 * actual conservation tooling lives inside the Atlas / Interaction /
 * Zoo modules; this section is the public-facing narrative around them.
 */
const conservationPillars = [
  {
    icon: TreePine,
    title: 'Habitat-aware decisions',
    body: 'Atlas overlays surface ecological richness, climate envelopes, and protected-area gaps for every species page.',
  },
  {
    icon: Microscope,
    title: 'Open ecological science',
    body: 'GloBI-derived interaction panels show pollinators, mycorrhizal partners, and trophic ties — with transparent "data needed" states.',
  },
  {
    icon: BookOpen,
    title: 'Education on the page',
    body: 'Glossary tooltips, ecological badges, and reviewer guidance turn every species record into a teachable artifact.',
  },
  {
    icon: Users,
    title: 'Community capacity',
    body: 'Citizen reviewers, herbaria, and field stations contribute through the same typed API — credit and provenance preserved.',
  },
];

// Placeholder partner slots — the real list will be populated by the
// /api/partners endpoint once institutional agreements are in place.
const partners: { name: string; kind: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { name: 'Botanical Garden Network', kind: 'Living collections', icon: Leaf },
  { name: 'Research Universities', kind: 'Phylogenetics & ecology', icon: University },
  { name: 'Conservation NGOs', kind: 'Field protection', icon: TreePine },
  { name: 'Citizen Science Hubs', kind: 'Observation networks', icon: Users },
  { name: 'Herbaria & Museums', kind: 'Specimen records', icon: Building2 },
  { name: 'Education Partners', kind: 'Curriculum integration', icon: GraduationCap },
];

const ConservationPartners: React.FC = () => {
  return (
    <section
      id="conservation"
      className="relative py-28 bg-[#0d1f17] text-white border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        {/* Conservation & Education */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mb-20">
          <div className="lg:col-span-5">
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4">
              Conservation &amp; Education
            </div>
            <h2 className="font-serif text-4xl md:text-5xl leading-tight">
              Knowledge that protects<br />
              <span className="italic text-emerald-200/90">
                what it describes.
              </span>
            </h2>
            <p className="text-white/65 mt-6 leading-relaxed max-w-md">
              The Continuum is built so every page a learner reads, every
              dataset a researcher cites, and every record a reviewer
              validates becomes part of a single conservation feedback loop.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
            {conservationPillars.map(p => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="bg-[#142a1f] p-6">
                  <div className="w-9 h-9 rounded-lg bg-emerald-300/10 border border-emerald-300/30 flex items-center justify-center mb-4">
                    <Icon className="h-4 w-4 text-emerald-200" />
                  </div>
                  <div className="font-serif text-lg text-white mb-1.5">
                    {p.title}
                  </div>
                  <p className="text-xs text-white/65 leading-relaxed">
                    {p.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Partners / Institutions */}
        <div className="border-t border-white/10 pt-14">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-3">
                Partners &amp; Institutions
              </div>
              <h3 className="font-serif text-2xl md:text-3xl">
                Built with the field, not for it.
              </h3>
            </div>
            <p className="text-sm text-white/55 max-w-md">
              Placeholder partner slots — the real list is published from
              <span className="text-emerald-200"> /api/partners</span> once
              institutional agreements are in place.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
            {partners.map(p => {
              const Icon = p.icon;
              return (
                <div
                  key={p.name}
                  className="bg-[#142a1f] px-5 py-7 text-center flex flex-col items-center gap-3"
                >
                  <Icon className="h-6 w-6 text-emerald-200/80" />
                  <div className="text-sm font-medium text-white/85 leading-tight">
                    {p.name}
                  </div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-white/45">
                    {p.kind}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ConservationPartners;
