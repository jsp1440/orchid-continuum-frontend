import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Leaf,
  MapPin,
  Loader2,
  Network,
  Bookmark,
  BookmarkCheck,
  AlertCircle,
  X,
} from 'lucide-react';
import FallbackImage from '@/components/orchid/FallbackImage';
import NeighborOverlapMap from '@/components/orchid/NeighborOverlapMap';
import { fetchNeighborGenera, type NeighborGenus } from '@/lib/genusData';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/auth/AuthModal';
import { saveComparison } from '@/lib/comparisons';


/**
 * NeighborGeneraSection — the full, explorable co-occurring-neighbours view for
 * the /genus/:name detail page. It expands the homepage four-card preview into:
 *
 *   • An occurrence OVERLAP map (focal genus + every neighbour cloud, colour
 *     coded) so the spatial basis for adjacency is visible.
 *   • A complete grid of co-occurring neighbour genera (up to 12), each with a
 *     real photo, the shared-region label, and the ECOLOGICAL RELATIONSHIP text
 *     describing how that neighbour relates to the focal genus.
 *
 * Neighbours + relationships come from {@link fetchNeighborGenera} (cache-first
 * Supabase → live OC occurrence Atlas + iNaturalist), so previously-viewed
 * genera load instantly. Known Catasetum neighbours get the curated copy below.
 */

const NEIGHBOR_LIMIT = 12;

/**
 * Curated ecological-relationship copy for known Catasetum neighbours — kept in
 * sync with the homepage SpeciesInFocus section so the same precise text shows
 * here too. Keyed by lower-case genus name.
 */
const RELATIONSHIP_OVERRIDES: Record<string, string> = {
  gongora:
    'Shares orchid bee pollinators — different scent chemistry attracts different bee species',
  stanhopea:
    'Same euglossine bee guild — chemical signals partition the shared pollinators',
  epidendrum:
    'Co-occurs on same trees — pollinated by butterflies and hummingbirds instead',
  sobralia:
    'Same forest floor and understory — uses bee and hummingbird pollinators',
};

const relationshipFor = (genusName: string, current?: string): string | undefined => {
  const key = (genusName || '').trim().split(/\s+/)[0].toLowerCase();
  return RELATIONSHIP_OVERRIDES[key] ?? current;
};

const NeighborCard: React.FC<{ n: NeighborGenus }> = ({ n }) => {
  const relationship = relationshipFor(n.genus, n.relationship);
  const urls = n.image ? [n.image] : [];
  return (
    <div className="group flex flex-col rounded-2xl overflow-hidden bg-[#16271a] border border-[#c9a24a]/20 hover:border-[#c9a24a]/50 transition-colors">
      <Link
        to={`/genus/${encodeURIComponent(n.genus)}`}
        className="relative block aspect-[16/10] bg-[#1a2e1a] overflow-hidden"
        aria-label={`View ${n.genus}`}
      >
        {urls.length > 0 ? (
          <FallbackImage
            urls={urls}
            alt={n.genus}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#c9a24a]">
            <Leaf className="h-7 w-7" strokeWidth={1.1} />
            <span className="mt-2 font-mono text-[9px] tracking-[0.2em] uppercase">
              Photo coming soon
            </span>
          </div>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-[#0d2535]/85 backdrop-blur px-2.5 py-1 font-mono text-[9px] tracking-[0.24em] uppercase text-[#c9a24a] border border-[#c9a24a]/40">
          <Leaf className="h-3 w-3" /> Neighbor
        </span>
        <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#16271a] to-transparent" />
      </Link>

      <div className="flex flex-col flex-1 p-6">
        <Link
          to={`/genus/${encodeURIComponent(n.genus)}`}
          className="italic text-[#faf7f2] leading-tight hover:text-[#c9a24a] transition-colors"
          style={{
            fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
            fontSize: 'clamp(1.3rem, 2vw, 1.7rem)',
          }}
        >
          {n.genus}
        </Link>

        {n.region && (
          <div className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/75">
            <MapPin className="h-3.5 w-3.5 text-[#c9a24a]" />
            {n.region}
          </div>
        )}

        {relationship && (
          <div className="mt-4 flex-1">
            <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.3em] uppercase text-[#c9a24a]/80">
              <span className="inline-block w-5 h-px bg-[#c9a24a]/50" />
              Ecological Relationship
            </div>
            <p className="mt-2 italic text-[#c9a24a] text-[13px] leading-[1.65]">
              {relationship}
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            to={`/genus/${encodeURIComponent(n.genus)}`}
            className="group/btn inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#c9a24a] text-[#14281c] hover:bg-[#e6c763] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
          >
            Genus page
            <ArrowRight className="h-3.5 w-3.5 group-hover/btn:translate-x-1 transition-transform" />
          </Link>
          <Link
            to={`/atlas?genus=${encodeURIComponent(n.genus)}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#c9a24a]/40 text-[#faf7f2] hover:bg-[#c9a24a]/10 hover:border-[#c9a24a] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
          >
            View in atlas
          </Link>
        </div>
      </div>
    </div>
  );
};

interface NeighborGeneraSectionProps {
  genus: string;
}

const NeighborGeneraSection: React.FC<NeighborGeneraSectionProps> = ({ genus }) => {
  const { user } = useAuth();
  const [neighbors, setNeighbors] = useState<NeighborGenus[]>([]);
  const [loading, setLoading] = useState(true);

  // Save-comparison UI state
  const [authOpen, setAuthOpen] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setNeighbors([]);
    // Reset save state when the focal genus changes.
    setShowSave(false);
    setSaved(false);
    setSaveError(null);
    setName('');
    fetchNeighborGenera(genus, ctrl.signal, NEIGHBOR_LIMIT)
      .then((list) => {
        if (ctrl.signal.aborted) return;
        setNeighbors(list);
      })
      .catch(() => {
        /* leave empty → honest empty state */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [genus]);

  const neighborNames = useMemo(
    () => neighbors.map((n) => n.genus),
    [neighbors],
  );

  const openSave = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setSaved(false);
    setSaveError(null);
    if (!name.trim()) setName(`${genus} & neighbours`);
    setShowSave(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    const res = await saveComparison({ name, focalGenus: genus, neighbors });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error || 'Could not save comparison.');
      return;
    }
    setSaved(true);
    setShowSave(false);
  };


  return (
    <section className="max-w-[1200px] mx-auto px-6 lg:px-10 mt-16 pt-12 border-t border-white/10">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase text-[#c9a24a]">
        <Network className="h-3.5 w-3.5" />
        Co-occurring neighbours
      </div>
      <h2
        className="mt-4 italic text-[#faf7f2] leading-tight max-w-3xl"
        style={{
          fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
          fontSize: 'clamp(1.7rem, 3.2vw, 2.6rem)',
        }}
      >
        No orchid grows alone — the genera that share{' '}
        <span className="text-[#c9a24a]">{genus}</span>&rsquo;s range.
      </h2>
      <p className="mt-3 max-w-2xl text-[#cfc8b8]/80 text-[15px] leading-relaxed">
        Derived live from the occurrence Atlas: other orchid genera recorded in
        the same forests and countries as {genus}, with the ecological
        relationship that links each one to it.
      </p>

      {/* Save-comparison bar (signed-in members can bookmark this set) */}
      {neighbors.length > 0 && (
        <div className="mt-7 rounded-2xl border border-[#c9a24a]/25 bg-[#16271a]/70 p-5 sm:p-6">
          {saved ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-[#c9a24a]">
                <BookmarkCheck className="h-5 w-5" />
                <div>
                  <div className="font-mono text-[10px] tracking-[0.24em] uppercase">
                    Comparison saved
                  </div>
                  <p className="mt-1 text-[#cfc8b8]/80 text-sm">
                    Revisit it any time from your account.
                  </p>
                </div>
              </div>
              <Link
                to="/account"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#c9a24a]/40 text-[#faf7f2] hover:bg-[#c9a24a]/10 hover:border-[#c9a24a] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
              >
                View saved comparisons
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : showSave ? (
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <label className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]">
                Name this comparison
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder={`${genus} & neighbours`}
                  className="flex-1 rounded-full bg-[#0d2535]/60 border border-[#c9a24a]/30 px-4 py-2.5 text-[#faf7f2] placeholder:text-[#cfc8b8]/40 text-sm focus:outline-none focus:border-[#c9a24a]"
                />
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#c9a24a] text-[#14281c] hover:bg-[#e6c763] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowSave(false)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full border border-[#c9a24a]/30 text-[#cfc8b8]/80 hover:text-[#faf7f2] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
              {saveError && (
                <div className="flex items-center gap-2 text-[#e8a0a0] text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {saveError}
                </div>
              )}
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]">
                  Save this comparison
                </div>
                <p className="mt-1 text-[#cfc8b8]/80 text-sm max-w-md">
                  Bookmark {genus} and its {neighbors.length} co-occurring
                  neighbours to your account to revisit later.
                </p>
              </div>
              <button
                onClick={openSave}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#c9a24a] text-[#14281c] hover:bg-[#e6c763] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
              >
                <Bookmark className="h-4 w-4" />
                {user ? 'Save comparison' : 'Sign in to save'}
              </button>
            </div>
          )}
        </div>
      )}


      {/* Occurrence overlap map */}
      {neighborNames.length > 0 && (
        <div className="mt-8">
          <NeighborOverlapMap focalGenus={genus} neighborGenera={neighborNames} />
        </div>
      )}

      {/* Full neighbour grid */}
      <div className="mt-10">
        {loading && neighbors.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#cfc8b8]/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase">
              Discovering co-occurring genera
            </span>
          </div>
        ) : neighbors.length === 0 ? (
          <div className="rounded-2xl border border-[#c9a24a]/15 bg-[#16271a] p-12 text-center">
            <Leaf className="h-8 w-8 text-[#c9a24a] mx-auto" strokeWidth={1.1} />
            <p className="mt-4 font-mono text-[11px] tracking-[0.24em] uppercase text-[#c9a24a]">
              No co-occurring neighbours found yet for {genus}
            </p>
            <p className="mt-2 text-[#cfc8b8]/70 text-sm">
              The occurrence Atlas has no overlapping genera on record for this
              genus.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {neighbors.map((n) => (
              <NeighborCard key={n.genus} n={n} />
            ))}
          </div>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode="signin" />
    </section>

  );
};

export default NeighborGeneraSection;
