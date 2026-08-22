import React, { useMemo, useState } from 'react';
import { Film, Info } from 'lucide-react';

import PageShell from '@/components/orchid/PageShell';
import {
  SCREEN_ORCHIDS,
  SCREEN_ORCHIDS_PROVENANCE,
  type ScreenOrchidEntry,
} from '@/data/screenOrchids';

/**
 * Orchids on screen — the recovered FCOS film writing.
 *
 * A reading experience, not a media library. The retired widget it came from
 * re-hosted copyrighted posters and linked full features; the recovered data
 * has no field for either, so there is nothing here to render but credits and
 * the authors' own prose. That is the point rather than a shortfall.
 */

function DecadeGroup({ decade, films }: { decade: string; films: ScreenOrchidEntry[] }) {
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-300/70">
        {decade}
      </h2>
      <div className="mt-4 space-y-4">
        {films.map((film) => (
          <article
            key={film.slug}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            data-testid="screen-orchid"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="font-serif text-xl text-white">{film.title}</h3>
              {film.genre ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                  {film.genre}
                </span>
              ) : null}
            </div>

            {film.director || film.stars ? (
              <p className="mt-1 text-xs text-white/50">
                {film.director ? `Directed by ${film.director}` : null}
                {film.director && film.stars ? ' · ' : null}
                {film.stars}
              </p>
            ) : null}

            {film.orchidFocus ? (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300/70">
                {film.orchidFocus}
              </p>
            ) : null}

            {film.description ? (
              <p className="mt-2 text-sm leading-6 text-white/75">{film.description}</p>
            ) : null}

            {film.orchidSignificance ? (
              <p className="mt-3 border-l-2 border-amber-300/30 pl-3 text-sm leading-6 text-white/60">
                {film.orchidSignificance}
              </p>
            ) : null}

            {film.portrayalNote ? (
              <p className="mt-3 text-xs leading-5 text-white/45">
                <span className="text-white/60">On the portrayal: </span>
                {film.portrayalNote}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ScreenOrchids() {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? SCREEN_ORCHIDS.filter((film) =>
          [film.title, film.director, film.stars, film.orchidFocus, film.description]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(needle)),
        )
      : SCREEN_ORCHIDS;

    const byDecade = new Map<string, ScreenOrchidEntry[]>();
    for (const film of matching) {
      const decade = film.year ? `${Math.floor(film.year / 10) * 10}s` : 'Undated';
      if (!byDecade.has(decade)) byDecade.set(decade, []);
      byDecade.get(decade)!.push(film);
    }
    return [...byDecade.entries()];
  }, [query]);

  const total = groups.reduce((sum, [, films]) => sum + films.length, 0);

  return (
    <PageShell
      eyebrow="Culture"
      title="Orchids on screen"
      titleAccent="what films have made of them."
      intro="Nearly a century of cinema has used orchids to mean wealth, decadence, obsession and decay. These readings, written for the Fivefold Path article collection, trace what the flower has been asked to stand for."
      heroAside={
        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-amber-300/80">
            <Info className="h-3 w-3" /> Writing, not a media library
          </div>
          <p className="text-xs leading-relaxed text-white/65">
            {SCREEN_ORCHIDS_PROVENANCE.statement}
          </p>
          <p className="mt-3 text-[10px] leading-relaxed text-white/45">
            {SCREEN_ORCHIDS_PROVENANCE.authorship}.
          </p>
        </div>
      }
    >
      <section className="py-10">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
              Search these readings
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="A title, a director, a theme…"
              className="w-full rounded-lg border border-white/15 bg-[#11101b] px-4 py-3 text-sm text-white placeholder:text-white/30"
            />
          </label>

          <p className="mt-3 flex items-center gap-2 text-xs text-white/45">
            <Film className="h-3.5 w-3.5" />
            {total} of {SCREEN_ORCHIDS.length} readings
          </p>

          {total === 0 ? (
            <p className="mt-10 text-sm text-white/60">
              No reading in this collection matches that search.
            </p>
          ) : (
            groups.map(([decade, films]) => (
              <DecadeGroup key={decade} decade={decade} films={films} />
            ))
          )}
        </div>
      </section>
    </PageShell>
  );
}
