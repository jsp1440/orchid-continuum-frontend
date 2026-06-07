import React, { useEffect, useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { fetchAtlasOccurrences } from '@/lib/ocBackend';

/**
 * AtlasCompletenessBadge — data-provenance strip shown above the map.
 *
 *   "X occurrence records · Source: Orchid Continuum + GBIF"
 *
 * Count is fetched live from the Orchid Continuum backend (with a GBIF
 * fallback) and updates dynamically once the data resolves.
 */

const AtlasCompletenessBadge: React.FC = () => {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAtlasOccurrences(500, ctrl.signal)
      .then((pts) => setCount(pts.length))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  return (
    <div className="rounded-2xl border border-[#c9a24a]/30 bg-[#0a0d1c]/70 backdrop-blur-md px-5 py-3 flex items-center gap-3">
      <Database className="h-4 w-4 text-[#c9a24a]" />
      <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.18em] uppercase text-[#faf7f2]">
        {loading ? (
          <span className="inline-flex items-center gap-2 text-[#cfc8b8]/70">
            <Loader2 className="h-3 w-3 animate-spin" /> Counting occurrence
            records…
          </span>
        ) : (
          <>
            <span className="text-[#c9a24a]">
              {(count ?? 0).toLocaleString()}
            </span>{' '}
            occurrence records ·{' '}
            <span className="text-[#cfc8b8]/70">
              Source: Orchid Continuum + GBIF
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default AtlasCompletenessBadge;
