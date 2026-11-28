/**
 * /mycorrhizae/[taxa] — fungal association profile.
 * If no mycorrhizal records exist, renders an honest "Awaiting" page.
 * If the relationship read failed, says the records could not be checked
 * instead: a failed read is not evidence that no association is recorded.
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Network, Loader2, ImageOff, AlertTriangle } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { Awaiting } from '@/components/orchid/SourceBadges';
import {
  didRelationshipReadFail,
  fetchMycorrhiza,
  fetchMycorrhizalAggregates,
  type MycorrhizalAggregate,
} from '@/lib/orchidContinuum';

const MycorrhizaProfile: React.FC = () => {
  const { taxa } = useParams();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MycorrhizalAggregate | null>(null);
  const [all, setAll] = useState<MycorrhizalAggregate[]>([]);
  const [readFailed, setReadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let list = await fetchMycorrhizalAggregates();
      if (cancelled) return;
      let failed = didRelationshipReadFail('mycorrhiza');
      let p: MycorrhizalAggregate | null = null;
      if (taxa) {
        // A failed mycorrhizal read is not cached, so this second read retries it.
        p = await fetchMycorrhiza(taxa);
        if (cancelled) return;
        if (failed && !didRelationshipReadFail('mycorrhiza')) {
          // The retry succeeded and is now the cached answer: take the index from
          // it too, so the page does not show the first read's empty index and
          // "could not be checked" alert beside a profile from the second read.
          list = await fetchMycorrhizalAggregates();
          if (cancelled) return;
        }
        // The outcome shown is the outcome of the last read behind what is rendered.
        failed = didRelationshipReadFail('mycorrhiza');
      }
      setAll(list);
      setProfile(p);
      setReadFailed(failed);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [taxa]);

  return (
    <div className="min-h-screen bg-[#04050d] text-[#f5f0e8]" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`
        .font-display { font-family: 'Playfair Display', Georgia, serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>
      <Navbar />
      <main className="pt-20">
        <section className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
          <Link to="/atlas" className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] mb-6">
            <ArrowLeft className="h-3.5 w-3.5" /> Atlas
          </Link>
          <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
            Mycorrhizal intelligence
          </div>
          <h1 className="font-display leading-[1]" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
            Orchid <span className="italic text-[#c9a24a]">fungal partnerships</span>
          </h1>

          {loading && (
            <div className="mt-10 font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70 inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading mycorrhizal layer…
            </div>
          )}

          {!loading && readFailed && (
            <div
              role="alert"
              data-testid="relationship-read-outcome"
              className="mt-10 rounded-2xl border border-[#c9a24a]/30 bg-[#0a0d1c]/70 p-8 max-w-2xl"
            >
              <AlertTriangle className="h-7 w-7 text-[#c9a24a]/70 mb-4" strokeWidth={1.2} />
              <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]/85 mb-2">
                Mycorrhizal relationship records could not be checked
              </div>
              <p className="text-[14px] text-[#cfc8b8]/80 leading-relaxed">
                The read of the Continuum's relationship records did not complete, so this page
                cannot say whether a fungal association is recorded.{' '}
                {all.length === 0
                  ? 'This is not evidence that no association exists. Reload the page to try again.'
                  : 'The associations shown below may be incomplete. Reload the page to try again.'}
              </p>
            </div>
          )}

          {!loading && !readFailed && all.length === 0 && (
            <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-10 max-w-2xl">
              <Network className="h-9 w-9 text-[#c9a24a]/50 mb-4" strokeWidth={1.2} />
              <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]/70 mb-2">
                Awaiting Orchid Continuum Record
              </div>
              <p className="text-[14px] text-[#cfc8b8]/80 leading-relaxed">
                The Continuum's mycorrhizal layer is being assembled. Once steward-reviewed
                fungal association records are linked into <code className="font-mono text-[12px] text-[#c9a24a]/85">species_mycorrhizal</code>,
                each association will appear here with a back-reference to its orchid partner
                and the literature it was extracted from. No mycorrhizal data will be fabricated.
              </p>
              <Awaiting what="Mycorrhizal records" />
            </div>
          )}

          {!loading && all.length > 0 && !taxa && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {all.map((m) => (
                <Link
                  key={m.slug}
                  to={`/mycorrhizae/${encodeURIComponent(m.slug)}`}
                  className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-5 hover:border-[#c9a24a]/50 transition-colors"
                >
                  <Network className="h-4 w-4 text-[#c9a24a] mb-2" />
                  <div className="font-display italic text-[18px] text-[#faf7f2]">{m.taxon}</div>
                  {m.family && (
                    <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#7a7466] mt-1">
                      {m.family}
                    </div>
                  )}
                  <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/65 mt-3">
                    {m.speciesCount} orchid species
                  </div>
                </Link>
              ))}
            </div>
          )}

          {!loading && taxa && profile && (
            <div className="mt-8">
              <h2 className="font-display italic text-3xl mb-3">{profile.taxon}</h2>
              {profile.family && (
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#c9a24a]/80 mb-4">
                  {profile.family}
                </div>
              )}
              <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6 max-w-xl">
                <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a] mb-4">Associated orchids</div>
                <ul className="divide-y divide-white/[0.06]">
                  {profile.species.map((s) => (
                    <li key={s.id}>
                      <Link to={`/species/${encodeURIComponent(s.slug)}`} className="flex items-center gap-3 py-3">
                        <div className="w-10 h-10 rounded bg-[#06091a] border border-[#c9a24a]/20 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {s.imageUrl ? <img src={s.imageUrl} className="w-full h-full object-cover" alt="" /> : <ImageOff className="h-3.5 w-3.5 text-[#c9a24a]/40" />}
                        </div>
                        <span className="font-display italic text-[14px] text-[#faf7f2]">{s.scientificName}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default MycorrhizaProfile;
