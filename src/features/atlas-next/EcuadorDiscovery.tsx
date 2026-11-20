import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AtlasGlobe from './AtlasGlobe';
import { SCALES } from './types';
import {
  loadDiscoveryRecords, readDiscoveryPassport, safeDiscoveryNote, writeDiscoveryPassport,
  type DiscoveryRecord,
} from './ecuadorDiscovery';

const ECUADOR_FOCUS = { lat: -1.8, lng: -78.2, distance: SCALES.country.cameraDistance };
const panel = 'rounded-2xl border border-white/15 bg-[#101f1b] p-5 sm:p-7';
const action = 'inline-flex min-h-11 items-center rounded-full border border-[#9addb1] px-5 py-2 font-semibold text-[#e3fff0] hover:bg-[#254c39] disabled:opacity-50';
const gaps = ['Conservation', 'Pollination', 'Mycorrhiza'];

type Load = { kind: 'waiting' | 'loading' | 'unavailable' } | { kind: 'ready'; records: DiscoveryRecord[] };

export default function EcuadorDiscovery() {
  const [stage, setStage] = useState<'choose' | 'explore' | 'complete'>('choose');
  const [load, setLoad] = useState<Load>({ kind: 'waiting' });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<DiscoveryRecord | null>(null);
  const [passport, setPassport] = useState(readDiscoveryPassport);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [warning, setWarning] = useState('');
  const isExploring = stage === 'explore';

  useEffect(() => {
    if (!isExploring) return;
    const request = new AbortController();
    setLoad({ kind: 'loading' });
    const timeout = window.setTimeout(() => {
      request.abort();
      setLoad({ kind: 'unavailable' });
    }, 12000);
    void loadDiscoveryRecords(request.signal).then(
      (records) => {
        if (!request.signal.aborted) setLoad({ kind: 'ready', records });
      },
      () => {
        if (!request.signal.aborted) setLoad({ kind: 'unavailable' });
      },
    ).finally(() => window.clearTimeout(timeout));
    return () => {
      request.abort();
      window.clearTimeout(timeout);
    };
  }, [isExploring, attempt]);

  function selectRecord(record: DiscoveryRecord) {
    setSelected(record);
    setNote(passport[record.name]?.note ?? '');
    setMessage('');
    setWarning('');
  }

  function save(text?: string) {
    if (!selected) return;
    setWarning('');
    const observation = text === undefined ? undefined : safeDiscoveryNote(text);
    if (text !== undefined && !observation) {
      setWarning('Write a short habitat observation without coordinates or exact locations.');
      return;
    }
    try {
      setPassport(writeDiscoveryPassport(selected.name, observation ? { note: observation } : passport[selected.name] ?? {}));
      setMessage(observation ? 'Observation saved on this browser.' : 'Species saved to your Passport.');
    } catch {
      setWarning('This browser could not save your Passport. Check its storage settings and try again.');
    }
  }

  const entries = Object.entries(passport);
  const hasObservation = entries.some(([, entry]) => Boolean(entry.note));
  const records = load.kind === 'ready' ? load.records : [];
  const allObserved = records.length > 0 && records.every((record) => Boolean(passport[record.name]?.note));
  const next = records.find((record) => record.name !== selected?.name && !passport[record.name]?.note);
  const choosing = stage === 'choose';

  return (
    <main className="min-h-screen bg-[#091411] text-[#f2f0e5]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8 sm:py-12">
        <Link to="/atlas-next" className="inline-flex min-h-11 items-center break-words text-[#b5e6c9] underline underline-offset-4">
          Back to Orchid Atlas
        </Link>
        <div className="grid gap-5 md:grid-cols-[1fr_1.2fr] md:items-stretch">
          <div className={panel}>
            <p className="text-sm font-semibold text-[#a1dab5]">Orchid Atlas Discovery Expedition</p>
            <h1 className="my-3 font-serif text-4xl leading-tight text-[#fff9e8] sm:text-5xl">Orchids of Ecuador</h1>
            <p className="text-lg text-[#dfebda]">From Wonder to Observation</p>
            <p className="my-4 max-w-prose text-[#c4d6c8]">
              Welcome to Ecuador’s cloud forests. Follow orchid records and notice how habitat and elevation can turn a moment of wonder into a scientific observation.
            </p>
            {stage === 'choose' && <button className={action} onClick={() => setStage('explore')}>Orchids of Ecuador</button>}
            {!choosing && <p className="text-sm text-[#b5e6c9]">Map view focused on Ecuador. Individual sites are withheld from the expedition map.</p>}
          </div>
          <div role="img" aria-label={choosing ? 'Atlas globe' : 'Atlas globe centered on Ecuador'} className="relative min-h-64 overflow-hidden rounded-2xl border border-white/15 bg-[#05070b]">
            <AtlasGlobe marks={[]} focus={choosing ? null : ECUADOR_FOCUS} autoRotate={false} onSelect={() => {}} />
          </div>
        </div>

        {isExploring && (
          <section aria-labelledby="ecuador-records" className={panel}>
            <h2 id="ecuador-records" className="font-serif text-2xl">Explore verified occurrence records</h2>
            {load.kind === 'loading' && <p role="status" className="mt-3">Checking the governed public occurrence source…</p>}
            {load.kind === 'unavailable' && (
              <div className="mt-3 space-y-3">
                <p role="status">Verified public records are unavailable right now. No demonstration records are shown.</p>
                <button className={action} onClick={() => setAttempt(attempt + 1)}>Try again</button>
              </div>
            )}
            {load.kind === 'ready' && records.length === 0 && <p role="status" className="mt-3">No eligible records were returned. This does not establish that orchids are absent.</p>}
            {records.length > 0 && (
              <>
                <p className="mt-2 text-sm text-[#c4d6c8]">Each stop is one published record. This sample is not a range or abundance estimate.</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {records.map((record) => (
                    <li key={record.name}>
                      <button className={action} aria-pressed={selected?.name === record.name} onClick={() => selectRecord(record)}>
                        <i>{record.name}</i>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {isExploring && selected && (
          <section aria-label={`Species card for ${selected.name}`} className={panel}>
            <p className="text-sm text-[#a1dab5]">Species card · one verified occurrence</p>
            <h2 className="mt-1 font-serif text-3xl italic">{selected.name}</h2>
            <dl className="my-5 grid gap-4 sm:grid-cols-2">
              {[
                ['Scientific name', selected.name], ['Genus', selected.genus],
                ['Region', 'Ecuador · country-level view'],
                ['Habitat', selected.habitat ?? 'No public habitat linked to this stop.'],
                ['Elevation', selected.elevationBand ?? 'No public elevation linked to this stop.'],
                ...gaps.map((label) => [label, 'No evidence linked to this occurrence in the public source.']),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm font-semibold text-[#b5e6c9]">{label}</dt>
                  <dd className="mt-1">{value}</dd>
                </div>
              ))}
            </dl>
            {selected.habitat || selected.elevationBand ? (
              <p>
                <strong>Look closer.</strong> This record documents the orchid
                {selected.habitat ? ` in ${selected.habitat.toLowerCase()}` : ''}
                {selected.elevationBand ? ` in the elevation band ${selected.elevationBand}` : ''}.
                {' '}One record is evidence of a place it was found.
              </p>
            ) : (
              <p>This occurrence documents a record in Ecuador. Habitat and elevation are open questions at this stop.</p>
            )}
            <p className="mt-2 text-sm text-[#c4d6c8]">Source · {selected.source}</p>
            <button className={`${action} mt-5`} disabled={Boolean(passport[selected.name])} onClick={() => save()}>
              {passport[selected.name] ? 'Saved to Orchid Explorer Passport' : 'Save species to Orchid Explorer Passport'}
            </button>

            {passport[selected.name] && (
              <form className="mt-6 space-y-3" onSubmit={(event) => { event.preventDefault(); save(note); }}>
                <label htmlFor="ecuador-discovery-note" className="block font-semibold">What did you notice about where this orchid grows?</label>
                <p id="ecuador-discovery-note-help" className="text-sm text-[#c4d6c8]">Describe the habitat or elevation. Leave out exact locations and coordinates.</p>
                <textarea id="ecuador-discovery-note" aria-describedby="ecuador-discovery-note-help" value={note} required maxLength={480}
                  onChange={(event) => setNote(event.target.value)}
                  className="block min-h-24 w-full rounded-lg border border-[#a1dab5]/60 bg-[#091411] p-3" />
                <button className={action} type="submit">Save observation</button>
              </form>
            )}
            <div className="mt-2 space-y-2">
              {warning && <p role="alert" className="text-[#ffdb9b]">{warning}</p>}
              {message && <p role="status" className="text-[#a1dab5]">{message}</p>}
              {passport[selected.name]?.note && next && (
                <button className={action} onClick={() => selectRecord(next)}>Continue to next species</button>
              )}
              {allObserved && <button className={action} onClick={() => setStage('complete')}>Finish expedition</button>}
            </div>
          </section>
        )}

        {!choosing && (
          <section className={panel} aria-labelledby="ecuador-passport">
            <h2 id="ecuador-passport" className="font-serif text-2xl">Orchid Explorer Passport</h2>
            <p className="mt-2 text-sm text-[#c4d6c8]">This Passport stays in this browser. It is neither synced nor submitted as a scientific record. Clearing browser data removes it.</p>
            {hasObservation && <p className="mt-3 font-semibold text-[#a1dab5]">Award earned · First Scientific Observation</p>}
            <ul className="mt-3 list-inside list-disc">
              {entries.map(([name, entry]) => <li key={name}><i>{name}</i>{entry.note && <> · {entry.note}</>}</li>)}
            </ul>
          </section>
        )}

        {stage === 'complete' && (
          <section className={panel} aria-labelledby="ecuador-finish">
            <h2 id="ecuador-finish" className="font-serif text-2xl">Observation is the first step</h2>
            <p className="mt-3 max-w-prose">
              You observed what the records say and where the evidence stops. Ask a question, form a testable hypothesis, then look for evidence that could support or challenge it.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className={action} to="/classroom/investigation">Practise the scientific method</Link>
              <Link className={action} to="/research">Continue to Research Mode</Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
