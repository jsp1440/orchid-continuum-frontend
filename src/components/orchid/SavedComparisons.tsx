import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Network,
  Loader2,
  Trash2,
  ArrowRight,
  Leaf,
  MapPin,
} from 'lucide-react';
import {
  listComparisons,
  deleteComparison,
  type SavedComparison,
} from '@/lib/comparisons';

/**
 * SavedComparisons — list view of the signed-in member's saved genus
 * comparisons (focal genus + neighbour snapshot). Rendered inside the
 * protected /account page. Each row can be expanded to its neighbour set,
 * re-opened on the genus detail page, or deleted.
 */
const SavedComparisons: React.FC = () => {
  const [items, setItems] = useState<SavedComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listComparisons()
      .then((list) => {
        if (mounted) setItems(list);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDelete = async (id: string) => {
    setBusyId(id);
    const res = await deleteComparison(id);
    setBusyId(null);
    if (res.ok) setItems((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <section className="mt-6 rounded-sm border border-quiet bg-warm-white p-6 lg:p-7">
      <div className="flex items-center gap-2 mb-1 text-forest">
        <Network className="h-4 w-4" />
        <h2 className="font-display text-[1.3rem] text-ink">Saved comparisons</h2>
      </div>
      <p className="font-body text-[14px] text-charcoal/70 max-w-prose">
        Focal genera and their co-occurring neighbour sets you have bookmarked.
        Open any one to revisit the full explorable view.
      </p>

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-charcoal/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase">
              Loading your comparisons
            </span>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-sm border border-quiet bg-cream p-8 text-center">
            <Leaf className="h-7 w-7 text-gold mx-auto" strokeWidth={1.1} />
            <p className="mt-3 font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/70">
              No saved comparisons yet
            </p>
            <p className="mt-2 font-body text-[14px] text-charcoal/65 max-w-sm mx-auto">
              Visit any genus page and save its co-occurring neighbour set to
              build a personal shelf of orchid neighbourhoods.
            </p>
            <Link
              to="/genus/Catasetum"
              className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase px-4 py-2 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-colors"
            >
              Explore a genus
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map((c) => (
              <li
                key={c.id}
                className="rounded-sm border border-quiet bg-cream p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-[1.25rem] text-ink truncate">
                      {c.name}
                    </div>
                    <div className="mt-1 font-mono text-[10px] tracking-[0.18em] uppercase text-charcoal/60 inline-flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-gold">
                        <MapPin className="h-3.5 w-3.5" /> {c.focal_genus}
                      </span>
                      <span>
                        {c.neighbor_genera.length} neighbour
                        {c.neighbor_genera.length === 1 ? '' : 's'}
                      </span>
                      <span>
                        {new Date(c.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      to={`/genus/${encodeURIComponent(c.focal_genus)}`}
                      className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] uppercase px-3.5 py-2 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-colors"
                    >
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={busyId === c.id}
                      aria-label="Delete comparison"
                      className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-quiet text-charcoal/60 hover:text-[#b94a48] hover:border-[#b94a48]/50 transition-colors disabled:opacity-50"
                    >
                      {busyId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {c.neighbor_genera.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.neighbor_genera.map((n) => (
                      <Link
                        key={n.genus}
                        to={`/genus/${encodeURIComponent(n.genus)}`}
                        title={n.relationship || n.region || n.genus}
                        className="inline-flex items-center gap-1.5 rounded-full border border-quiet bg-warm-white px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/75 hover:text-forest hover:border-forest transition-colors"
                      >
                        <Leaf className="h-3 w-3 text-gold" />
                        {n.genus}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default SavedComparisons;
