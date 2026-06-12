import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Emergency homepage safe mode.
 *
 * This deliberately avoids the full AppLayout/DailyGenusFeature startup path so
 * the public site can render while the homepage image/runtime crash is repaired.
 */
const Index: React.FC = () => {
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-950 to-black text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-[0.35em] text-emerald-200/80">
          Orchid Continuum
        </p>
        <h1 className="max-w-4xl text-4xl font-semibold leading-tight md:text-6xl">
          Connecting orchid biodiversity, knowledge, and conservation.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-emerald-50/80">
          The Orchid Continuum is online. The live research galleries are being refreshed.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            to="/atlas"
            className="rounded-full bg-white px-6 py-3 font-medium text-emerald-950 shadow-lg hover:bg-emerald-100"
          >
            Open Atlas
          </Link>
          <Link
            to="/species"
            className="rounded-full border border-white/40 px-6 py-3 font-medium text-white hover:bg-white/10"
          >
            Search Species
          </Link>
        </div>
      </section>
    </main>
  );
};

export default Index;
