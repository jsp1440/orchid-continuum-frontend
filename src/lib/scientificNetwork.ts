/** Bounded backend KG projection. No relationships are inferred in the browser. */
export type NetworkNode = {
  id: string; label: string; type: string; status: string; canonicalKey: string | null; taxonomicVersion: string | null;
};
export type NetworkEvidence = {
  id: string; source: string; sourceRecord: string | null; citation: string | null;
  classification: string; status: string; confidence: number | null; license: string | null;
  taxonomicVersion: string | null; originalPredicate: string | null; experimentalScope: string | null; independence: string;
  assertionId: string | null; conflictingAssertionIds: string[]; conflict: { present: boolean; truncated: boolean; withheld: boolean }; reviewState: string; verificationState: string;
};
export type NetworkEdge = {
  id: string; source: string; target: string; predicate: string; active: boolean;
  classification: string; status: string; evidenceClass: string; sourceTable: string;
  confidence: number | null; evidence: NetworkEvidence[]; originalPredicate: string | null; semanticsStatus: string;
};
export type ScientificNetwork = {
  nodes: NetworkNode[]; edges: NetworkEdge[]; truncated: boolean; warnings: string[];
  depth: number; withheld: number; dangling: number;
};
export const EMPTY_NETWORK: ScientificNetwork = {
  nodes: [], edges: [], truncated: false, warnings: [], depth: 0, withheld: 0, dangling: 0,
};
export const NETWORK_LIMITS = { nodes: 250, edges: 500, neighborhood: 100 } as const;
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown, fallback = 'unknown'): string =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : fallback;
const projectedText = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() ? text(v) : null;
  const projection = record(v);
  return projection?.withheld !== true && typeof projection?.text === 'string' && projection.text.trim() ? text(projection.text) : null;
};
const SOURCE_ID = /^(?:source_concept:oc_mycorrhiza\.orchid_fungal_associations:(?:orchid_name|fungal_name):[a-f0-9]{64}|source_assertion:oc_mycorrhiza\.orchid_fungal_associations:[1-9][0-9]*(?::(?:subject|object|citation))?|publication:doi:10\.[0-9]{4,9}\/[-._;()/:A-Za-z0-9]+)$/;
const id = (v: unknown): string | null =>
  (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) || (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > 0)
    ? String(v) : typeof v === 'string' && v.length <= 220 && SOURCE_ID.test(v) ? v : null;
const confidence = (v: unknown): number | null => {
  const n = record(v)?.score ?? v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};
const count = (v: unknown): number => typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;

export function normalizeNetworkNode(value: unknown): NetworkNode | null {
  const n = record(value); const key = id(n?.id);
  if (!n || !key || typeof n.label !== 'string' || !n.label.trim() || typeof n.node_type !== 'string') return null;
  return { id: key, label: text(n.label), type: text(n.node_type), status: text(n.taxonomic_status), canonicalKey: typeof n.canonical_key === 'string' ? text(n.canonical_key) : null, taxonomicVersion: projectedText(n.taxonomic_version) };
}

function normalizeEvidence(value: unknown): NetworkEvidence | null {
  const e = record(value); if (!e || e.withheld === true) return null;
  const p = record(e.provenance); const c = record(e.citation);
  const conflict = record(e.conflict_declaration);
  const safeEvidenceId = (value: unknown): string | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === 'string' && value.length <= 220 && /^[A-Za-z0-9._:-]+$/.test(value) && !/^withheld/i.test(value) ? value : null;
  return {
    id: typeof e.id === 'number' ? String(e.id) : text(e.id, 'unidentified evidence'), source: text(p?.source_table), sourceRecord: p?.source_pk == null ? null : String(p.source_pk),
    citation: c?.withheld === true ? null : typeof c?.text === 'string' ? text(c.text) : null,
    classification: text(e.classification), status: text(e.validation_status), confidence: confidence(e.confidence),
    license: projectedText(e.license),
    taxonomicVersion: projectedText(e.taxonomic_version),
    originalPredicate: typeof e.original_predicate === 'string' ? text(e.original_predicate) : null,
    experimentalScope: typeof e.experimental_scope === 'string' ? text(e.experimental_scope) : record(e.experimental_scope) ? ['germination_confirmed', 'protocorm_confirmed', 'adult_root_confirmed'].filter(key => typeof (e.experimental_scope as Record<string, unknown>)[key] === 'boolean').map(key => `${key}=${String((e.experimental_scope as Record<string, unknown>)[key])}`).join('; ') || null : null,
    independence: text(e.independence),
    assertionId: safeEvidenceId(e.assertion_id),
    conflictingAssertionIds: conflict?.withheld === true ? [] : Array.isArray(e.conflicting_assertion_ids) ? e.conflicting_assertion_ids.slice(0, 30).map(safeEvidenceId).filter((value): value is string => value !== null) : [],
    conflict: { present: conflict?.present === true, truncated: conflict?.truncated === true, withheld: conflict?.withheld === true },
    reviewState: text(e.review_state), verificationState: text(e.verification_state),
  };
}

export function normalizeScientificNetwork(value: unknown): ScientificNetwork | null {
  const g = record(value); const pagination = record(g?.pagination); const scope = record(g?.scope);
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges) || typeof pagination?.truncated !== 'boolean') return null;
  const nodes = g.nodes.map(normalizeNetworkNode);
  if (nodes.some(n => !n)) return null;
  const nodeList = Array.from(new Map((nodes as NetworkNode[]).map(n => [n.id, n])).values()).slice(0, NETWORK_LIMITS.nodes);
  const ids = new Set(nodeList.map(n => n.id));
  const edges: NetworkEdge[] = []; let dangling = count(scope?.dangling_edges);
  for (const raw of g.edges) {
    const e = record(raw); const key = id(e?.id); const from = id(e?.from); const to = id(e?.to);
    if (!e || !key || !from || !to || typeof e.edge_type !== 'string' || typeof e.is_active !== 'boolean') return null;
    if (!ids.has(from) || !ids.has(to)) { dangling += 1; continue; }
    const p = record(e.provenance);
    edges.push({ id: key, source: from, target: to, predicate: text(e.edge_type), active: e.is_active,
      classification: text(e.classification), status: text(e.validation_status), evidenceClass: text(e.evidence_class),
      sourceTable: text(p?.source_table), confidence: confidence(e.confidence),
      originalPredicate: typeof e.original_predicate === 'string' ? text(e.original_predicate) : null, semanticsStatus: text(e.semantics_status, 'STORED_GRAPH_CLASSIFICATION_UNVALIDATED'),
      evidence: Array.isArray(e.evidence) ? e.evidence.map(normalizeEvidence).filter((x): x is NetworkEvidence => x !== null) : [],
    });
  }
  const uniqueEdges = Array.from(new Map(edges.map(e => [e.id, e])).values());
  return { nodes: nodeList, edges: uniqueEdges.slice(0, NETWORK_LIMITS.edges),
    truncated: pagination.truncated || g.nodes.length > nodeList.length || uniqueEdges.length > NETWORK_LIMITS.edges,
    warnings: [...(Array.isArray(g.warnings) ? g.warnings.filter((v): v is string => typeof v === 'string').map(v => text(v)) : []), ...(Array.isArray(g.missing_evidence) ? g.missing_evidence.filter((v): v is string => typeof v === 'string').map(v => text(v)) : [])],
    depth: count(scope?.depth), withheld: count(scope?.withheld_nodes), dangling,
  };
}

export function mergeScientificNetworks(previous: ScientificNetwork, next: ScientificNetwork): ScientificNetwork {
  const allNodes = Array.from(new Map([...previous.nodes, ...next.nodes].map(n => [n.id, n])).values());
  const nodes = allNodes.slice(0, NETWORK_LIMITS.nodes); const ids = new Set(nodes.map(n => n.id));
  const allEdges = Array.from(new Map([...previous.edges, ...next.edges].map(e => [e.id, e])).values()).filter(e => ids.has(e.source) && ids.has(e.target));
  return { nodes, edges: allEdges.slice(0, NETWORK_LIMITS.edges),
    truncated: previous.truncated || next.truncated || allNodes.length > nodes.length || allEdges.length > NETWORK_LIMITS.edges,
    warnings: Array.from(new Set([...previous.warnings, ...next.warnings])), depth: Math.max(previous.depth, next.depth),
    withheld: Math.max(previous.withheld, next.withheld), dangling: Math.max(previous.dangling, next.dangling),
  };
}

export type NetworkFilters = { relationship: string; evidence: string; status: string; source: string; taxonomicStatus: string };
export const EMPTY_FILTERS: NetworkFilters = { relationship: '', evidence: '', status: '', source: '', taxonomicStatus: '' };
export function filterScientificNetwork(g: ScientificNetwork, f: NetworkFilters): ScientificNetwork {
  const allowedNodes = new Set(g.nodes.filter(n => !f.taxonomicStatus || n.status === f.taxonomicStatus).map(n => n.id));
  const edges = g.edges.filter(e => (!f.relationship || e.predicate === f.relationship) && (!f.evidence || e.evidenceClass === f.evidence)
    && (!f.status || e.status === f.status) && (!f.source || e.sourceTable === f.source) && allowedNodes.has(e.source) && allowedNodes.has(e.target));
  const touched = new Set(edges.flatMap(e => [e.source, e.target]));
  const edgeFilter = f.relationship || f.evidence || f.status || f.source;
  return { ...g, edges, nodes: g.nodes.filter(n => allowedNodes.has(n.id) && (!edgeFilter || touched.has(n.id))) };
}

/** Traversal is visual/undirected; arrows retain the source's directed assertion. */
export function boundedPaths(g: ScientificNetwork, from: string, to: string, maxPaths = 3): string[][] {
  if (!g.nodes.some(n => n.id === from) || !g.nodes.some(n => n.id === to) || from === to) return [];
  const adjacency = new Map<string, Array<{ next: string; edge: string }>>();
  for (const e of g.edges) {
    for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) adjacency.set(a, [...(adjacency.get(a) ?? []), { next: b, edge: e.id }]);
  }
  const paths: string[][] = []; const queue = [{ node: from, visited: [from], edges: [] as string[] }]; let scanned = 0;
  while (queue.length && paths.length < maxPaths && scanned++ < 2000) {
    const p = queue.shift()!;
    if (p.edges.length >= 6) continue;
    for (const a of adjacency.get(p.node) ?? []) {
      if (p.visited.includes(a.next)) continue;
      const edges = [...p.edges, a.edge];
      if (a.next === to) paths.push(edges);
      else queue.push({ node: a.next, visited: [...p.visited, a.next], edges });
      if (paths.length >= maxPaths) break;
    }
  }
  return paths;
}

export function networkComponents(g: ScientificNetwork): string[][] {
  const pending = new Set(g.nodes.map(n => n.id)); const components: string[][] = [];
  while (pending.size) {
    const first = pending.values().next().value as string; const group = [first]; pending.delete(first);
    for (let i = 0; i < group.length; i++) for (const edge of g.edges) {
      const next = edge.source === group[i] ? edge.target : edge.target === group[i] ? edge.source : null;
      if (next && pending.delete(next)) group.push(next);
    }
    components.push(group);
  }
  return components;
}

/** Seeded deterministic spring layout; finite work (80 iterations, at most 250 nodes). */
export function layoutScientificNetwork(g: ScientificNetwork): Map<string, { x: number; y: number }> {
  const nodes = g.nodes.slice(0, NETWORK_LIMITS.nodes); const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => positions.set(n.id, { x: 500 + 220 * Math.cos(i * 2.39996), y: 300 + 220 * Math.sin(i * 2.39996) }));
  for (let t = 0; t < 80; t++) {
    const forces = new Map(nodes.map(n => [n.id, { x: 0, y: 0 }]));
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = positions.get(nodes[i].id)!; const b = positions.get(nodes[j].id)!;
      const dx = a.x - b.x; const dy = a.y - b.y; const distance = Math.max(25, Math.hypot(dx, dy)); const force = 1500 / (distance * distance);
      const fa = forces.get(nodes[i].id)!; const fb = forces.get(nodes[j].id)!;
      fa.x += dx * force; fa.y += dy * force; fb.x -= dx * force; fb.y -= dy * force;
    }
    for (const e of g.edges) {
      const a = positions.get(e.source); const b = positions.get(e.target); if (!a || !b) continue;
      const dx = b.x - a.x; const dy = b.y - a.y; const distance = Math.max(1, Math.hypot(dx, dy)); const force = (distance - 125) * 0.006;
      const fa = forces.get(e.source)!; const fb = forces.get(e.target)!;
      fa.x += dx / distance * force; fa.y += dy / distance * force; fb.x -= dx / distance * force; fb.y -= dy / distance * force;
    }
    for (const n of nodes) {
      const p = positions.get(n.id)!; const f = forces.get(n.id)!;
      p.x = Math.max(55, Math.min(945, p.x + Math.max(-8, Math.min(8, f.x + (500 - p.x) * 0.002))));
      p.y = Math.max(55, Math.min(545, p.y + Math.max(-8, Math.min(8, f.y + (300 - p.y) * 0.002))));
    }
  }
  return positions;
}

/** Export only the normalized public projection, never raw backend payload/meta. */
export function exportScientificNetwork(g: ScientificNetwork, projection: 'materialized' | 'source' = 'materialized'): string {
  return JSON.stringify({ format: 'orchid-scientific-subgraph/v1', scope: 'selected bounded view; never the complete graph',
    projection, sourceAssertionsAccepted: false, truncated: g.truncated, depth: g.depth, warnings: g.warnings, nodes: g.nodes, edges: g.edges }, null, 2);
}
