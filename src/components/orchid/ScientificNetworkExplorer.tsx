import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import {
  boundedPaths, EMPTY_FILTERS, EMPTY_NETWORK, exportScientificNetwork, filterScientificNetwork,
  layoutScientificNetwork, mergeScientificNetworks, networkComponents,
  type NetworkEdge, type NetworkNode, type ScientificNetwork,
} from '@/lib/scientificNetwork';
import { createScientificNetworkClient, type NetworkExplanation, type NetworkSourceRecord, type ScientificNetworkClient } from '@/lib/scientificNetworkApi';

const DEFAULT_CLIENT = createScientificNetworkClient(CALYX_BACKEND_BASE_URL);
const COLORS: Record<string, string> = {
  taxon: '#1d684a', species: '#1d684a', genus: '#7a8f3b', pollinator: '#b75f1b',
  fungus: '#7b4c9d', mycorrhiza: '#7b4c9d', trait: '#1d6a8a', publication: '#914d64',
  occurrence: '#5a6d90', image: '#9a641c', habitat: '#547b35', conservation_assessment: '#a1353d',
};
const color = (type: string) => COLORS[type] ?? '#5b6473';
const unique = (values: string[]) => [...new Set(values)].sort();
const fieldClass = 'min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm';
const buttonClass = 'rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-900 disabled:opacity-40';
const uncertain = (edge: NetworkEdge) => !edge.active || !['ACCEPTED', 'VALIDATED', 'VERIFIED'].includes(edge.status.toUpperCase()) || ['hypothesis', 'inferred', 'unknown', 'literature_assertion'].includes(edge.classification);

export default function ScientificNetworkExplorer({ initialQuery = '', client = DEFAULT_CLIENT }: {
  initialQuery?: string; client?: ScientificNetworkClient;
}) {
  const [query, setQuery] = useState(initialQuery); const [matches, setMatches] = useState<NetworkNode[]>([]);
  const [mode, setMode] = useState<'materialized' | 'source'>('materialized');
  const [sourceMatches, setSourceMatches] = useState<NetworkSourceRecord[]>([]);
  const [evidenceRoot, setEvidenceRoot] = useState<number | null>(null); const [explanation, setExplanation] = useState<NetworkExplanation | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false); const [searched, setSearched] = useState(false);
  const [graph, setGraph] = useState<ScientificNetwork>(EMPTY_NETWORK); const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedNode, setSelectedNode] = useState<string | null>(null); const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [pathFrom, setPathFrom] = useState(''); const [pathTo, setPathTo] = useState(''); const [pathIndex, setPathIndex] = useState(0);
  const [isolate, setIsolate] = useState(false); const [inactive, setInactive] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const request = useRef<AbortController | null>(null); const generation = useRef(0);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const startRequest = useCallback(() => { request.current?.abort(); const controller = new AbortController(); request.current = controller; const sequence = ++generation.current; setBusy(true); setError(''); return { controller, sequence }; }, []);
  const current = useCallback((sequence: number, controller: AbortController) => generation.current === sequence && !controller.signal.aborted, []);

  const search = useCallback(async (term: string) => {
    if (!term.trim()) return;
    const { controller, sequence } = startRequest(); setMatches([]); setSourceMatches([]); setSearched(false);
    try {
      if (mode === 'source') { const result = await client.sourceSearch(term, controller.signal); if (current(sequence, controller)) { setSourceMatches(result.records); setSearchTruncated(result.truncated); setSearched(true); } }
      else { const result = await client.search(term, controller.signal); if (current(sequence, controller)) { setMatches(result.nodes); setSearchTruncated(result.truncated); setSearched(true); } }
    }
    catch (e) { if (current(sequence, controller)) setError(e instanceof Error ? e.message : 'Graph search unavailable.'); }
    finally { if (current(sequence, controller)) setBusy(false); }
  }, [client, current, mode, startRequest]);

  useEffect(() => { setQuery(initialQuery); if (initialQuery.trim()) void search(initialQuery); return () => { request.current?.abort(); generation.current += 1; }; }, [initialQuery, search]);

  async function expand(node: NetworkNode, replace = false, includeInactive = inactive) {
    if (mode === 'source') { setSelectedNode(node.id); setSelectedEdge(null); setIsolate(true); return; }
    const { controller, sequence } = startRequest(); setSelectedNode(node.id); setSelectedEdge(null);
    try {
      const result = await client.neighborhood(node.id, controller.signal, includeInactive);
      if (current(sequence, controller)) { setGraph(previous => replace ? result : mergeScientificNetworks(previous, result)); setIsolate(false); setEvidenceRoot(Number(node.id)); setExplanation(null); }
    } catch (e) { if (current(sequence, controller)) setError(e instanceof Error ? e.message : 'Neighborhood unavailable.'); }
    finally { if (current(sequence, controller)) setBusy(false); }
  }

  async function openSource(sourceId: number) {
    const { controller, sequence } = startRequest();
    try { const result = await client.sourceNetwork(sourceId, controller.signal); if (current(sequence, controller)) { setGraph(result); setSelectedNode(null); setSelectedEdge(null); setIsolate(false); setEvidenceRoot(sourceId); setExplanation(null); } }
    catch (e) { if (current(sequence, controller)) setError(e instanceof Error ? e.message : 'Source network unavailable.'); }
    finally { if (current(sequence, controller)) setBusy(false); }
  }

  async function explain() {
    if (evidenceRoot === null) return; const { controller, sequence } = startRequest(); setExplanation(null);
    try { const result = await client.explain(mode, evidenceRoot, controller.signal); if (current(sequence, controller)) setExplanation(result); }
    catch (e) { if (current(sequence, controller)) setError(e instanceof Error ? e.message : 'Brain evidence retrieval unavailable.'); }
    finally { if (current(sequence, controller)) setBusy(false); }
  }

  async function inspect(edge: NetworkEdge) {
    if (mode === 'source') { setSelectedEdge(edge.id); setSelectedNode(null); return; }
    const { controller, sequence } = startRequest(); setSelectedEdge(edge.id); setSelectedNode(null);
    try { const detail = await client.edge(edge.id, controller.signal, inactive); if (current(sequence, controller)) setGraph(previous => mergeScientificNetworks(previous, detail)); }
    catch (e) { if (current(sequence, controller)) setError(e instanceof Error ? e.message : 'Edge evidence unavailable.'); }
    finally { if (current(sequence, controller)) setBusy(false); }
  }

  const filtered = useMemo(() => filterScientificNetwork(graph, filters), [graph, filters]);
  const displayed = useMemo(() => {
    if (!isolate || !selectedNode) return filtered;
    const edges = filtered.edges.filter(e => e.source === selectedNode || e.target === selectedNode);
    const ids = new Set([selectedNode, ...edges.flatMap(e => [e.source, e.target])]);
    return { ...filtered, nodes: filtered.nodes.filter(n => ids.has(n.id)), edges };
  }, [filtered, isolate, selectedNode]);
  const positions = useMemo(() => layoutScientificNetwork(displayed), [displayed]);
  const components = useMemo(() => networkComponents(displayed), [displayed]);
  const orphans = components.filter(group => group.length === 1).length;
  const paths = useMemo(() => boundedPaths(displayed, pathFrom, pathTo), [displayed, pathFrom, pathTo]);
  const highlighted = new Set(paths[pathIndex % Math.max(paths.length, 1)] ?? []);
  const node = graph.nodes.find(n => n.id === selectedNode); const edge = graph.edges.find(e => e.id === selectedEdge);
  const graphId = useRef(`network-${Math.random().toString(36).slice(2)}`).current;
  const reciprocal = displayed.edges.filter(e => displayed.edges.some(other => other.id !== e.id && other.source === e.target && other.target === e.source)).length;
  const parallel = displayed.edges.length - new Set(displayed.edges.map(e => `${e.source}|${e.target}|${e.predicate}`)).size;

  function exportView() {
    const blob = new Blob([exportScientificNetwork(displayed, mode)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'orchid-scientific-subgraph.json'; a.click(); URL.revokeObjectURL(url);
  }
  function reset() { request.current?.abort(); generation.current += 1; setBusy(false); setGraph(EMPTY_NETWORK); setFilters(EMPTY_FILTERS); setSelectedNode(null); setSelectedEdge(null); setPathFrom(''); setPathTo(''); setView({ x: 0, y: 0, zoom: 1 }); setIsolate(false); setError(''); setEvidenceRoot(null); setExplanation(null); }
  function submit(event: FormEvent) { event.preventDefault(); void search(query); }

  return <section aria-label="Scientific relationship network" className="rounded-3xl border border-emerald-200 bg-white p-4 text-slate-900 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs uppercase tracking-widest text-emerald-700">Live graph · evidence-backed exploration</p><h2 className="mt-1 text-2xl font-semibold">Scientific relationship network</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">Select an exact record, then click any connected node to expand two hops. Arrows show stored direction; paths are visual connections, not causal conclusions.</p></div>
      <button className={buttonClass} onClick={exportView} disabled={!displayed.nodes.length}>Export selected view and provenance</button>
    </div>
    <label className="mt-4 flex max-w-lg flex-col gap-1 text-sm">Graph evidence view<select aria-label="Graph evidence view" className={fieldClass} value={mode} onChange={e => { reset(); setMode(e.target.value as 'materialized' | 'source'); }}><option value="materialized">Materialized graph relationships</option><option value="source">Recorded source assertions (unverified)</option></select></label>
    {mode === 'source' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Recorded source assertions are unverified literature records with unresolved canonical identity. This is a separate read-only source projection, not accepted Knowledge Graph relationships. Source-node clicks inspect their loaded neighborhood; they do not use numeric KG expansion.</p>}
    <form onSubmit={submit} className="mt-5 flex flex-wrap gap-2"><label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">Search scientific names, synonyms, organisms, traits, locations or publications
      <input aria-label="Search graph records" className={fieldClass} value={query} onChange={e => setQuery(e.target.value)} maxLength={200} placeholder="Scientific name or concept" /></label>
      <button type="submit" className={buttonClass} disabled={busy || !query.trim()}>Search graph</button></form>
    {matches.length > 0 && <div className="mt-3"><p className="text-sm text-slate-600">Choose the intended graph identity. Similar names may represent distinct historical concepts.</p><ul className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-auto">{matches.map(n => <li key={n.id}><button className={buttonClass} onClick={() => void expand(n, true)} disabled={busy}>{n.label} · {n.type} · #{n.id}</button></li>)}</ul></div>}
    {sourceMatches.length > 0 && <ul className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-auto">{sourceMatches.map(record => <li key={record.sourceId}><button className={buttonClass} disabled={busy} onClick={() => void openSource(record.sourceId)}>{record.label} · {record.fungus} · source #{record.sourceId} · unverified</button></li>)}</ul>}
    {searchTruncated && <p className="mt-2 text-sm text-amber-800">Search is limited to 30 records. Refine the query.</p>}
    {searched && matches.length === 0 && sourceMatches.length === 0 && <p className="mt-3 text-sm">No graph record matched this query. This does not establish that scientific evidence is absent.</p>}
    {mode === 'materialized' && <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-sm"><input type="checkbox" checked={inactive} onChange={e => { const value = e.target.checked; setInactive(value); const focal = node ?? graph.nodes[0]; reset(); if (focal) void expand(focal, true, value); }} /> Include inactive and historical assertions</label>
      <span className="text-xs text-slate-500">Inactive or uncertain assertions use dashed lines and retain their status.</span></div>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    <p role="status" aria-live="polite" className="mt-4 text-sm text-slate-600">{busy ? 'Loading bounded graph evidence…' : `${displayed.nodes.length} nodes · ${displayed.edges.length} directed assertions in this view`}</p>
    {graph.nodes.length > 0 && <>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{([
        ['relationship', 'Relationship', unique(graph.edges.map(e => e.predicate))], ['evidence', 'Evidence quality', unique(graph.edges.map(e => e.evidenceClass))],
        ['status', 'Validation status', unique(graph.edges.map(e => e.status))], ['source', 'Provenance source', unique(graph.edges.map(e => e.sourceTable))],
        ['taxonomicStatus', 'Taxonomic status', unique(graph.nodes.map(n => n.status))],
      ] as const).map(([key, label, values]) => <label key={key} className="flex flex-col gap-1 text-xs">{label}<select className={fieldClass} aria-label={label} value={filters[key]} onChange={e => { setFilters(previous => ({ ...previous, [key]: e.target.value })); setPathIndex(0); }}><option value="">All loaded</option>{values.map(v => <option value={v} key={v}>{v}</option>)}</select></label>)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><button className={buttonClass} aria-label="Zoom in" onClick={() => setView(v => ({ ...v, zoom: Math.min(3, v.zoom + 0.25) }))}>+</button><button className={buttonClass} aria-label="Zoom out" onClick={() => setView(v => ({ ...v, zoom: Math.max(0.4, v.zoom - 0.25) }))}>−</button>
        <button className={buttonClass} onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>Fit view</button><button className={buttonClass} disabled={!selectedNode} onClick={() => setIsolate(v => !v)}>{isolate ? 'Show loaded view' : 'Isolate selected neighborhood'}</button>
        <button className={buttonClass} onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button><button className={buttonClass} onClick={reset}>Reset network</button><button className={buttonClass} disabled={busy || evidenceRoot === null} onClick={() => void explain()}>Explain retrieved paths with Brain</button></div>
      <p className="mt-2 text-xs text-slate-500">Filters apply to loaded records only. Brain explanation makes a separate authenticated bounded retrieval from the last expanded root, retaining missing evidence and default-off controls.</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs" aria-label="Node category legend"><span>Stored categories:</span>{unique(displayed.nodes.map(n => n.type)).map(type => <span key={type} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: color(type) }} />{type}</span>)}</div>
      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <svg role="img" aria-label="Interactive scientific network. Click nodes to expand and relationships to inspect evidence." viewBox="0 0 1000 600" className="min-h-80 w-full touch-none rounded-2xl border border-slate-200 bg-slate-50"
          onPointerDown={event => { if (event.target === event.currentTarget) { drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture?.(event.pointerId); } }}
          onPointerMove={event => { if (!drag.current) return; const bounds = event.currentTarget.getBoundingClientRect(); const factor = bounds.width > 0 ? 1000 / bounds.width : 1; const dx = (event.clientX - drag.current.x) * factor; const dy = (event.clientY - drag.current.y) * factor; setView(v => ({ ...v, x: v.x + dx, y: v.y + dy })); drag.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <defs><marker id={`${graphId}-arrow`} viewBox="0 0 10 10" refX="24" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker></defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {displayed.edges.map((e, index) => { const a = positions.get(e.source); const b = positions.get(e.target); if (!a || !b) return null; const bend = index % 2 === 0 ? 9 : -9; const cx = (a.x + b.x) / 2 + bend; const cy = (a.y + b.y) / 2 - bend;
              return <g key={e.id} role="button" tabIndex={0} aria-label={`Inspect relationship ${e.predicate} #${e.id}`} onClick={() => void inspect(e)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void inspect(e); } }} className="cursor-pointer">
                <path d={`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`} stroke="transparent" strokeWidth="18" fill="none" />
                <path d={`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`} stroke={highlighted.has(e.id) ? '#d97706' : !e.active ? '#b91c1c' : '#64748b'} strokeWidth={highlighted.has(e.id) ? 4 : 1.5} strokeDasharray={uncertain(e) ? '6 4' : undefined} fill="none" markerEnd={`url(#${graphId}-arrow)`} />
                <title>{`${e.predicate} · ${e.classification} · ${e.status}${e.active ? '' : ' · inactive'}`}</title>
              </g>; })}
            {displayed.nodes.map(n => { const p = positions.get(n.id)!; return <g key={n.id} role="button" tabIndex={0} aria-label={`${mode === 'source' ? 'Inspect' : 'Expand'} ${n.label} #${n.id}`} aria-pressed={selectedNode === n.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onClick={() => void expand(n)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void expand(n); } }}>
              <circle r={selectedNode === n.id ? 17 : 13} fill={color(n.type)} stroke={selectedNode === n.id ? '#f59e0b' : 'white'} strokeWidth="3" />
              <text y="31" textAnchor="middle" fontSize="12" fill="#1e293b">{n.label.length > 32 ? `${n.label.slice(0, 30)}…` : n.label}</text><title>{`${n.label} · ${n.type} · #${n.id}`}</title>
            </g>; })}
          </g>
        </svg>
        <aside aria-label="Graph record details" className="max-h-[36rem] overflow-auto rounded-2xl border border-slate-200 p-4 text-sm">
          {node ? <><h3 className="font-semibold">{node.label}</h3><p>Stored category: {node.type} · #{node.id}</p><p className="mt-2">Taxonomic status: {node.status} · version: {node.taxonomicVersion ?? 'unbound'}</p><p className="break-all text-xs">{node.canonicalKey ?? 'Canonical key unavailable'}</p><p className="mt-2 text-xs">Stored categories have not been independently validated. A pollinator category alone does not establish pollination.</p><button className={`${buttonClass} mt-3`} disabled={busy} onClick={() => void expand(node)}>{mode === 'source' ? 'Show loaded neighborhood' : 'Expand connected neighborhood'}</button></>
            : edge ? <><h3 className="font-semibold">{edge.predicate}</h3><p>#{edge.id} · {edge.source} → {edge.target}</p><p className="mt-2">{mode === 'source' ? 'Recorded source assertion (not materialized in KG)' : edge.active ? 'Active' : 'Inactive historical assertion'} · {edge.classification} · {edge.status}</p><p>Evidence class: {edge.evidenceClass}</p><p>Confidence: {edge.confidence === null ? 'unknown / uncalibrated' : `${edge.confidence} (stored score, not independently calibrated)`}</p>
              <p className="mt-2">Original source predicate: {edge.originalPredicate ?? 'not resolved'}</p><p className="break-all text-xs">{edge.semanticsStatus}</p><p className="mt-2 text-xs">The stored edge label does not establish verified pollination or a causal association.</p>
              <h4 className="mt-4 font-semibold">Supporting evidence records ({edge.evidence.length})</h4>{edge.evidence.length === 0 && <p>No attributable evidence record was returned. This connection is not established as accepted science.</p>}
              {edge.evidence.map((e, i) => <article key={`${e.id}-${i}`} className="mt-3 rounded-lg bg-slate-50 p-3"><p className="break-all font-medium">{e.id}</p><p>{e.classification} · {e.status}</p><p className="break-all text-xs">{e.source}{e.sourceRecord ? `:${e.sourceRecord}` : ''}</p><p className="mt-2 whitespace-pre-wrap">{e.citation ?? 'Citation missing or withheld'}</p><p className="mt-2 text-xs">Original predicate: {e.originalPredicate ?? 'unresolved'} · Experimental scope: {e.experimentalScope ?? 'unknown'} · Independence: {e.independence}</p><p className="mt-2 text-xs">Review: {e.reviewState} · Verification: {e.verificationState} · Assertion: {e.assertionId ?? 'unavailable'}</p>{(e.conflict.present || e.conflictingAssertionIds.length > 0 || e.conflict.withheld || e.conflict.truncated) && <p className="mt-2 text-xs text-rose-900">Conflict links: {e.conflictingAssertionIds.join(', ') || 'unavailable'}{e.conflict.present ? ' · conflict declared' : ''}{e.conflict.withheld ? ' · identifiers withheld' : ''}{e.conflict.truncated ? ' · list truncated' : ''}</p>}<p className="mt-2 text-xs">Licence: {e.license ?? 'unknown'} · Taxonomy version: {e.taxonomicVersion ?? 'unbound'}</p></article>)}</>
              : <p>Select a node or edge to inspect its identity and evidence. Distinct evidence records remain separate; their number does not establish independence.</p>}
        </aside>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2"><label className="flex flex-col text-xs">Path from<select className={fieldClass} aria-label="Path from" value={pathFrom} onChange={e => { setPathFrom(e.target.value); setPathIndex(0); }}><option value="">Choose node</option>{displayed.nodes.map(n => <option key={n.id} value={n.id}>{n.label} #{n.id}</option>)}</select></label><label className="flex flex-col text-xs">Path to<select className={fieldClass} aria-label="Path to" value={pathTo} onChange={e => { setPathTo(e.target.value); setPathIndex(0); }}><option value="">Choose node</option>{displayed.nodes.map(n => <option key={n.id} value={n.id}>{n.label} #{n.id}</option>)}</select></label><button className={buttonClass} disabled={paths.length < 2} onClick={() => setPathIndex(i => i + 1)}>Highlight alternative path</button></div>
      {pathFrom && pathTo && <p className="mt-2 text-sm">{paths.length ? `${paths.length} visual path(s) found in this loaded view (up to 3 paths, 6 edges each).` : 'No connecting path found in this loaded view. The full graph may contain other paths.'}</p>}
      <p className="mt-4 text-xs text-slate-600">Returned view: {components.length} connected component(s), {orphans} singleton(s), {reciprocal} assertions with a reverse assertion, {parallel} additional parallel assertions. These are view diagnostics, not database-wide counts; direction, duplicates and independent evidence are different concepts.</p>
    </>}
    {explanation && <section aria-label="Brain graph explanation" className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm"><h3 className="font-semibold">Brain retrieval explanation</h3><p>{explanation.state} · {explanation.coverage}</p><p className="mt-2">{explanation.summary}</p><p className="mt-2 font-medium">Human review required. No publication or Reasoning Ledger write. Retrieved paths are not transitive scientific conclusions.</p><h4 className="mt-3 font-semibold">Traversed paths ({explanation.paths.length})</h4><ol className="max-h-64 list-decimal overflow-auto pl-5">{explanation.paths.map((path, index) => <li key={index} className="mt-2"><span className="break-all">{path.nodes.join(' → ')}</span><ul className="list-disc pl-4">{path.steps.map((step, i) => <li key={i}>{step.predicate} · {step.classification} · {step.status}{step.againstDirection ? ' · traversed against assertion direction' : ''}<span className="break-all"> · evidence: {step.evidenceIds.join(', ') || 'missing'}</span></li>)}</ul></li>)}</ol><h4 className="mt-3 font-semibold">Source citations</h4>{explanation.citations.length ? <ul className="list-disc pl-5">{explanation.citations.map(citation => <li key={citation}>{citation}</li>)}</ul> : <p>No attributable citation was returned.</p>}<h4 className="mt-3 font-semibold">Missing evidence and uncertainty</h4><ul className="list-disc pl-5">{explanation.missing.map(code => <li key={code}>{code}</li>)}</ul></section>}
    <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">This is a bounded neighborhood, never the complete graph.{graph.truncated ? ' Results are truncated; expand individual nodes or narrow the loaded view.' : ''}{graph.withheld ? ` ${graph.withheld} node(s) withheld by privacy policy.` : ''}{graph.dangling ? ` ${graph.dangling} dangling edge reference(s) omitted.` : ''} Missing links may reflect unavailable, quarantined or unprojected evidence.</p>
    {graph.warnings.length > 0 && <details className="mt-3 text-sm"><summary>Evidence gaps and query warnings ({graph.warnings.length})</summary><ul className="mt-2 list-disc pl-5">{graph.warnings.map((warning, i) => <li key={`${warning}-${i}`}>{warning}</li>)}</ul></details>}
  </section>;
}
