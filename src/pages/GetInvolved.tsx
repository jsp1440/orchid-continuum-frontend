import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart,
  HandCoins,
  Building2,
  Database,
  Mail,
  ArrowRight,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import GetInvolvedSection from '@/components/orchid/GetInvolved';

/**
 * GetInvolved — standalone page wrapping the homepage GetInvolved
 * pathways component with additional "ways to contribute" cards
 * (volunteer, donate, partner, submit data, newsletter).
 */

interface Way {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cta: string;
  onClick: () => void | string;
  href?: string;
  external?: boolean;
}

const GetInvolvedPage: React.FC = () => {
  const navigate = useNavigate();

  const ways: Way[] = [
    {
      icon: Heart,
      title: 'Volunteer',
      body: 'Become an Orchid Zoo reviewer, help curate species pages, or test new modules before they ship.',
      cta: 'Open Orchid Zoo',
      onClick: () => navigate('/zoo'),
    },
    {
      icon: HandCoins,
      title: 'Donate',
      body: 'Open biodiversity infrastructure runs on grants and gifts. Donations are tax-deductible through our fiscal sponsor, Ecologistics, a 501(c)(3) non-profit corporation.',
      cta: 'Donate via Ecologistics',
      href: 'https://www.ecologistics.org',
      external: true,

      onClick: () => undefined,
    },
    {
      icon: Building2,
      title: 'Partner',
      body: 'Botanical gardens, herbaria, universities, and conservation NGOs — propose a partnership.',
      cta: 'See partners',
      onClick: () => navigate('/partners'),
    },
    {
      icon: Database,
      title: 'Submit data',
      body: 'Occurrence records, microscopy, mycorrhizal cultures — every submission carries source, license, and citation back to you.',
      cta: 'Contact data team',
      href: 'mailto:data@orchidcontinuum.org',
      external: true,
      onClick: () => undefined,
    },
  ];

  return (
    <PageShell
      eyebrow="Join the Continuum"
      title="Get Involved"
      titleAccent="five doorways into open biodiversity."
      intro="Whether you have an hour, a herbarium specimen, or an institutional mandate — there is a doorway in. Pick the one that fits."
    >
      {/* Ways to contribute */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ways.map(w => {
              const Icon = w.icon;
              return (
                <div
                  key={w.title}
                  className="rounded-2xl border border-white/10 bg-[#142a1f] p-6 flex flex-col"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-300/10 border border-emerald-300/20 flex items-center justify-center text-emerald-200 mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-serif text-xl mb-2">{w.title}</div>
                  <p className="text-sm text-white/60 leading-relaxed flex-1 mb-4">
                    {w.body}
                  </p>
                  {w.href ? (
                    <a
                      href={w.href}
                      target={w.external ? '_blank' : undefined}
                      rel={w.external ? 'noopener noreferrer' : undefined}
                      className="inline-flex items-center gap-2 text-sm text-emerald-200 hover:text-emerald-100 transition-colors mt-auto"
                    >
                      {w.cta} <ArrowRight className="h-4 w-4" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => w.onClick()}
                      className="inline-flex items-center gap-2 text-sm text-emerald-200 hover:text-emerald-100 transition-colors mt-auto"
                    >
                      {w.cta} <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Newsletter shortcut */}
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-6 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-emerald-300/15 border border-emerald-300/30 flex items-center justify-center text-emerald-200 mb-4">
                <Mail className="h-5 w-5" />
              </div>
              <div className="font-serif text-xl mb-2">Newsletter</div>
              <p className="text-sm text-white/65 leading-relaxed flex-1 mb-4">
                One short note per month — new modules, species spotlights,
                and field updates. No noise.
              </p>
              <a
                href="#three-pathways"
                className="inline-flex items-center gap-2 text-sm text-emerald-200 hover:text-emerald-100 transition-colors mt-auto"
              >
                Sign up below <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Embedded three pathways + signup form */}
      <div id="three-pathways">
        <GetInvolvedSection />
      </div>
    </PageShell>
  );
};

export default GetInvolvedPage;
