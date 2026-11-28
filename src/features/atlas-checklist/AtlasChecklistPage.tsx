import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  checklistApi,
  type AreaResponse,
  type AreasResponse,
  type CalyxHandoff,
  type Envelope,
  type FacetPanel,
  type TaxonResponse,
} from './api';
import { atlasChecklistCalyxHref } from '@/features/atlas-next/calyxHandoff';

/**
 * Atlas · checklist distribution layer. A list-and-evidence view, not a map: the Continuum holds no geometry for
 * the checklist's areas, and the page says so. Areas, markers and statuses are shown as the source and the
 * graph give them; nothing is coloured, counted as a flora or read as an occurrence.
 */

function Gate({ data }: { data: Envelope | null }) {
  if (!data) return null;
  if (data.status === 'not_enabled')
    return <p role="status">The checklist layer is switched off. Nothing was read, and nothing is said about any taxon or area.</p>;
  if (data.status === 'unavailable')
    return <p role="status">The graph could not be read. This is a gap in what could be read, not an absence.</p>;
  return null;
}

function AskCalyx({ handoff }: { handoff: CalyxHandoff | null | undefined }) {
  if (!handoff) return null;
  const href = handoff.question ? atlasChecklistCalyxHref(handoff.question) : null;
  if (!href) return <p className="text-xs">{handoff.reason ?? 'No question can be handed to Calyx for this selection.'}</p>;
  return (
    <Link to={href} className="underline">
      Ask Calyx: “{handoff.question}”
    </Link>
  );
}

function Panel({ name, panel }: { name: string; panel: FacetPanel }) {
  return (
    <section aria-label={name} className="mb-3">
      <h4 className="font-medium">
        {name.replace(/_/g, ' ')} <span className="text-xs">({panel.state}, {panel.rows.length} read{panel.truncated ? ', more exist' : ''})</span>
      </h4>
      {panel.gap && <p className="text-xs">{panel.gap}</p>}
      {(panel.statements ?? []).map((line) => (
        <p key={line} className="text-sm">{line}</p>
      ))}
      <ul>
        {panel.rows.map((r) => (
          <li key={r.kg_edge_id} className="text-sm">
            {`${r.to_label ?? ''} `}
            {r.evidence?.checklist?.source_marker ? <span>[{r.evidence.checklist.source_marker}] </span> : null}
            {(r.evidence?.checklist?.source_tags ?? []).map((t) => (
              <span key={t}>[{t}] </span>
            ))}
            <span className="text-xs">
              {r.evidence_status} · review: {r.review_state ?? 'none recorded'} · {r.rule_name ?? r.source_table}
              {r.citation?.doi ? ` · doi ${r.citation.doi}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AtlasChecklistPage() {
  const [q, setQ] = useState('');
  const [areasOffset, setAreasOffset] = useState(0);
  const [areasHistory, setAreasHistory] = useState<number[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areas, setAreas] = useState<AreasResponse | null>(null);
  const [areaName, setAreaName] = useState<string | null>(null);
  const [genus, setGenus] = useState('');
  const [marked, setMarked] = useState<'any' | 'marked' | 'unmarked'>('any');
  const [offset, setOffset] = useState(0);
  const [areaRead, setArea] = useState<AreaResponse | null>(null);
  const [taxonId, setTaxonId] = useState<number | null>(null);
  const [taxonRead, setTaxon] = useState<TaxonResponse | null>(null);
  const [areasError, setAreasError] = useState<string | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [taxonError, setTaxonError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setAreasError(null);
    setAreasLoading(true);
    checklistApi.areas(q.trim(), areasOffset)
      .then((r) => live && setAreas(r))
      .catch((e: Error) => live && setAreasError(e.message))
      .finally(() => live && setAreasLoading(false));
    return () => {
      live = false;
    };
  }, [q, areasOffset]);

  useEffect(() => {
    setArea(null);
    setAreaError(null);
    setTaxonId(null);
    setTaxon(null);
    setTaxonError(null);
    if (!areaName) return;
    let live = true;
    const flag = marked === 'any' ? undefined : marked === 'marked';
    checklistApi.area(areaName, offset, genus.trim(), flag).then((r) => live && setArea(r)).catch((e: Error) => live && setAreaError(e.message));
    return () => {
      live = false;
    };
  }, [areaName, genus, marked, offset]);

  useEffect(() => {
    setTaxon(null);
    setTaxonError(null);
    if (taxonId === null) return;
    let live = true;
    checklistApi.taxon(taxonId).then((r) => live && setTaxon(r)).catch((e: Error) => live && setTaxonError(e.message));
    return () => {
      live = false;
    };
  }, [taxonId]);

  const gate = areas && areas.status !== 'available' ? areas : null;
  // Off/unavailable responses contain only the envelope, not success rows,
  // counts or cursors. Keep that status distinct from both loading and empty.
  const area = areaRead?.status === 'available' ? areaRead : null;
  const taxon = taxonRead?.status === 'available' ? taxonRead : null;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl">Atlas · checklist distribution</h1>
      {/* Source credit of this module (owner decision recorded on orchid-calyx-backend#2450): the compiler supplied the
          checklist and permits its public use with credit. The site-wide credit is on /partners. */}
      <p className="text-xs" data-testid="checklist-source-credit">
        Checklist data: <a href="https://www.worldplants.de" target="_blank" rel="noopener noreferrer" className="underline">World Plants</a>,
        the checklist of the Orchidaceae compiled by Dr. Michael Hassler, who supplied it to the Orchid Continuum and permits
        its public use with credit. See <Link to="/partners" className="underline">Partners &amp; Acknowledgements</Link>.
      </p>
      {areas && <p className="text-sm">{areas.notice}</p>}
      {areas && <p className="text-sm">Geometry: {areas.geometry.state.replace('_', ' ')}. {areas.geometry.explanation}</p>}
      {areasError && <p role="alert">{areasError}</p>}
      {areaError && <p role="alert">{areaError}</p>}
      {taxonError && <p role="alert">{taxonError}</p>}
      <Gate data={gate} />
      {!gate && (
        <div className="grid gap-6 md:grid-cols-3">
          <section aria-label="Areas">
            <label>
              Area name
              <input value={q} onChange={(e) => {
                setQ(e.target.value);
                setAreasOffset(0);
                setAreasHistory([]);
                setAreas(null);
                setAreasLoading(true);
              }} className="ml-2 border" />
            </label>
            <p className="text-xs">{areas ? `${areas.areas_matching} areas, names as the checklist writes them` : areasError ? 'Area names could not be read.' : 'Loading…'}</p>
            <ul>
              {areas?.areas.map((a) => (
                <li key={a.kg_node_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAreaName(a.label);
                      setOffset(0);
                      setTaxonId(null);
                      setTaxon(null);
                      setTaxonError(null);
                      if (a.label !== areaName) setArea(null);
                    }}
                  >
                    {a.label} <span className="text-xs">({a.taxa_listed} statements)</span>
                  </button>
                </li>
              ))}
            </ul>
            {areasHistory.length > 0 && (
              <button type="button" disabled={areasLoading} onClick={() => {
                setAreasOffset(areasHistory[areasHistory.length - 1]);
                setAreasHistory(areasHistory.slice(0, -1));
                setAreas(null);
                setAreasLoading(true);
              }}>Previous areas</button>
            )}
            {areas && areas.next_offset !== null && (
              <button type="button" disabled={areasLoading} onClick={() => {
                setAreasHistory([...areasHistory, areasOffset]);
                setAreasOffset(areas.next_offset ?? 0);
                setAreas(null);
                setAreasLoading(true);
              }}>Next areas</button>
            )}
          </section>
          <section aria-label="Taxa of the area">
            {!areaName && <p className="text-sm">Select an area.</p>}
            {areaName && (
              <>
                <h2 className="text-lg">{area?.area?.label ?? areaName}</h2>
                {area?.gap && <p>{area.gap}</p>}
                {area?.area && (
                  <p className="text-xs">
                    {area.taxa_listed} statements{area.taxa_listed_with_a_marker ? `, ${area.taxa_listed_with_a_marker} with a sign of the source` : ''}
                    {area.taxa_matching_filter !== undefined ? `; ${area.taxa_matching_filter} match the filter` : ''}. Statements, not a species count.
                  </p>
                )}
                <label>
                  Genus
                  <input value={genus} onChange={(e) => { setGenus(e.target.value); setOffset(0); }} className="ml-2 border" />
                </label>
                <label className="ml-3">
                  Source signs
                  <select value={marked} onChange={(e) => { setMarked(e.target.value as typeof marked); setOffset(0); }}>
                    <option value="any">any</option>
                    <option value="marked">with a sign (?, +, [I], [c])</option>
                    <option value="unmarked">without</option>
                  </select>
                </label>
                <Gate data={areaRead} />
                {!areaRead && <p className="text-sm">{areaError ? 'Taxa of this area could not be read.' : 'Loading…'}</p>}
                <ul>
                  {area?.taxa.map((t) => (
                    <li key={t.kg_edge_id}>
                      <button type="button" onClick={() => setTaxonId(t.taxon.kg_node_id)}>
                        {t.taxon.label}
                      </button>{' '}
                      {t.evidence.checklist?.source_marker ? <span>[{t.evidence.checklist.source_marker}]</span> : null}
                    </li>
                  ))}
                </ul>
                {offset > 0 && <button type="button" onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button>}
                {area && area.next_offset !== null && <button type="button" onClick={() => setOffset(area.next_offset ?? 0)}>Next</button>}
                <div><AskCalyx handoff={area?.calyx} /></div>
              </>
            )}
          </section>
          <section aria-label="Evidence for the taxon">
            {taxonId === null && <p className="text-sm">Select a taxon to see what the graph holds, with its sources and review state.</p>}
            {taxonId !== null && !taxonRead && !taxonError && <p>Loading…</p>}
            {taxonError && <p>Taxon evidence could not be read.</p>}
            <Gate data={taxonRead} />
            {taxonRead && !['available', 'not_enabled', 'unavailable'].includes(taxonRead.status) && <p>{taxonRead.explanation}</p>}
            {taxon?.identity && (
              <>
                <h2 className="text-lg">{taxon.identity.label}</h2>
                <p className="text-xs">graph node {taxon.identity.kg_node_id} · {taxon.identity.canonical_key}</p>
                {Object.entries(taxon.panels ?? {}).map(([group, facets]) => (
                  <div key={group}>
                    <h3 className="mt-3 uppercase text-xs">{group.replace(/_/g, ' ')}</h3>
                    {Object.entries(facets).map(([name, panel]) => (
                      <Panel key={name} name={name} panel={panel} />
                    ))}
                  </div>
                ))}
                <p className="text-xs">Not served by the Continuum's contract: {(taxon.not_served ?? []).map((n) => n.facet).join(', ')}.</p>
                <AskCalyx handoff={taxon.calyx} />
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
