import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CalyxApiError } from '@/lib/calyxWorkspace';
import {
  fetchResearchTraits,
  parseTraitSubject,
  type ResearchTraits,
  type TraitDistribution,
  type TraitSubject,
} from '@/lib/researchTraits';

type Result =
  | { status: 'idle' }
  | { status: 'loading'; subject: TraitSubject }
  | { status: 'ready'; data: ResearchTraits }
  | { status: 'error'; message: string };

function TraitRecord({ trait }: { trait: TraitDistribution }) {
  return (
    <article className="rounded-xl border border-white/15 p-4">
      <h3 className="font-serif text-xl">{trait.label}</h3>
      <p className="mt-2 text-sm text-white/75">
        Evidence state: <strong>{trait.evidence_state}</strong> · Units: {trait.unit ?? 'not supplied'}
      </p>
      <p className="mt-1 text-sm text-white/65">
        Sample size: {trait.sample_size ?? 'UNKNOWN'} · Confidence: {trait.confidence ?? 'not supplied'}
      </p>
      {trait.buckets.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{trait.label} distribution reported by the source</caption>
            <thead><tr><th scope="col" className="pb-2">Value</th><th scope="col" className="pb-2">Recorded count</th></tr></thead>
            <tbody>{trait.buckets.map((bucket, index) => (
              <tr key={index} className="border-t border-white/10">
                <td className="py-2 break-words">{bucket.value ?? 'UNKNOWN'}</td>
                <td className="py-2">{bucket.count ?? 'UNKNOWN'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="mt-3 text-sm text-white/65">No distribution values supplied. This is not a biological absence claim.</p>}
      <details className="mt-4 text-sm text-white/75">
        <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">Provenance · {trait.receipts.length ? 'inspect sources' : 'not supplied'}</summary>
        {trait.receipts.map((receipt, index) => (
          <div key={index} className="mt-3 grid gap-1 border-t border-white/10 pt-3 break-words">
            <dl className="grid gap-1">
            <div><dt className="inline font-semibold">Source: </dt><dd className="inline">{receipt.source_name ?? 'not supplied'}</dd></div>
            <div><dt className="inline font-semibold">Source ID: </dt><dd className="inline">{receipt.source_id ?? 'not supplied'}</dd></div>
            <div><dt className="inline font-semibold">Record: </dt><dd className="inline">{receipt.record_id ?? 'not supplied'}</dd></div>
            <div><dt className="inline font-semibold">Retrieved: </dt><dd className="inline">{receipt.retrieved_at ?? 'not supplied'}</dd></div>
            <div><dt className="inline font-semibold">License: </dt><dd className="inline">{receipt.license ?? 'not supplied'}</dd></div>
            </dl>
            {receipt.source_url ? <a href={receipt.source_url} target="_blank" rel="noopener noreferrer" className="text-emerald-200 underline">Open source (new tab)</a> : <p>Source link not supplied.</p>}
          </div>
        ))}
      </details>
    </article>
  );
}

export default function ResearchTraitExplorer({ initialSubject = '' }: { initialSubject?: string }) {
  const id = useId();
  const [name, setName] = useState(initialSubject);
  const [rank, setRank] = useState<TraitSubject['rank']>(initialSubject.includes(' ') ? 'species' : 'genus');
  const [result, setResult] = useState<Result>({ status: 'idle' });
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => { active.current?.abort(); }, []);

  function clearResult() {
    active.current?.abort();
    active.current = null;
    setResult({ status: 'idle' });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const subject = parseTraitSubject(rank, name);
    clearResult();
    if (!subject) {
      setResult({ status: 'error', message: 'Enter a genus (Cattleya) or species binomial (Cattleya purpurata) matching the selected scope.' });
      return;
    }
    const request = new AbortController();
    active.current = request;
    setResult({ status: 'loading', subject });
    try {
      const data = await fetchResearchTraits(subject, request.signal);
      if (active.current === request && !request.signal.aborted) setResult({ status: 'ready', data });
    } catch (error) {
      if (active.current !== request || request.signal.aborted) return;
      const message = error instanceof CalyxApiError && error.kind === 'authentication_required'
        ? 'Sign in to retrieve trait data. No trait records have been loaded.'
        : error instanceof CalyxApiError && error.kind === 'route_unavailable'
          ? 'Trait Explorer is not yet available from the research service. No trait data has been substituted.'
          : 'Trait data is unavailable for this request. Try again when the research service is available; missing data is not a zero or biological absence.';
      setResult({ status: 'error', message });
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-emerald-300/25 bg-[#142a1f] p-6 md:p-8">
      <h2 id={`${id}-title`} className="font-serif text-2xl">Trait Explorer</h2>
      <p id={`${id}-help`} className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
        Retrieve recorded trait distributions for a genus or species and inspect their sources.
        A selected name sets the search scope; it supplies no scientific evidence.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-4" aria-describedby={`${id}-help`}>
        <label className="grid gap-2 text-sm" htmlFor={`${id}-scope`}>
          Scope
          <select id={`${id}-scope`} value={rank} onChange={(event) => { clearResult(); setRank(event.target.value as TraitSubject['rank']); }} className="rounded-lg border border-white/25 bg-[#0d1f17] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
            <option value="genus">Genus</option><option value="species">Species</option>
          </select>
        </label>
        <label className="grid min-w-0 flex-1 basis-60 gap-2 text-sm" htmlFor={`${id}-name`}>
          Scientific name
          <input id={`${id}-name`} value={name} maxLength={160} required onChange={(event) => { clearResult(); setName(event.target.value); }} placeholder={rank === 'genus' ? 'Cattleya' : 'Cattleya purpurata'} className="min-w-0 rounded-lg border border-white/25 bg-[#0d1f17] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300" />
        </label>
        <button type="submit" disabled={result.status === 'loading'} className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-sm text-emerald-100 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
          {result.status === 'loading' ? 'Loading traits…' : 'Retrieve traits'}
        </button>
      </form>
      <div className="mt-5" aria-live="polite" aria-atomic="true" role="status">
        {result.status === 'idle' && <p className="text-sm text-white/65">Choose a subject, then retrieve its recorded traits.</p>}
        {result.status === 'loading' && <p className="text-sm text-white/75">Loading traits for {result.subject.name}…</p>}
        {result.status === 'error' && <p className="text-sm text-amber-100">{result.message}</p>}
        {result.status === 'ready' && <p className="text-sm text-white/75">{result.data.subject.name} · {result.data.subject.rank} · {result.data.state}</p>}
      </div>
      {result.status === 'ready' && (
        <div className="mt-4">
          <p className="mb-4 text-sm text-white/65">Snapshot: {result.data.generated_at ?? 'not supplied'}. States and counts are reported by the source; this view does not establish scientific conclusions.</p>
          {result.data.distributions.length
            ? <div className="grid gap-4 md:grid-cols-2">{result.data.distributions.map((trait) => <TraitRecord key={trait.trait_id} trait={trait} />)}</div>
            : <p className="text-sm text-white/75">{result.data.state === 'ABSENT' ? 'The service returned no trait records for this subject.' : `Trait records are ${result.data.state.toLowerCase()} for this response.`} No biological absence or zero count is inferred.</p>}
        </div>
      )}
    </section>
  );
}
