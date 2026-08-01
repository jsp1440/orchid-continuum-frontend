import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Database,
  GitBranch,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  Network,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { createOwnerSession, endOwnerSession, validateOwnerSession } from '@/lib/ownerOperationsConsole';
import {
  CALYX_INFERENCE_TYPES,
  fetchCalyxRelationships,
  queryCalyxGraph,
  runCalyxInference,
  submitCalyxInferenceToLedger,
  type CalyxEdge,
  type CalyxInferenceResponse,
  type CalyxInferenceResult,
  type CalyxInferenceType,
  type CalyxNode,
} from '@/lib/calyxBrain';

type AsyncState = 'idle' | 'loading' | 'ready' | 'error';

const humanize = (value: string) => value.replace(/_/g, ' ');
const percent = (value: number) => `${Math.round(value * 100)}%`;

function Panel({ title, icon: Icon, children }: {
  title: string;
  icon: typeof Network;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0d1d13]/92 p-5 shadow-xl">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c9a24a]">
        <Icon className="h-4 w-4" /> {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NodeCard({ node, selected, onSelect }: {
  node: CalyxNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition ${selected
        ? 'border-[#d4b34a]/70 bg-[#d4b34a]/12'
        : 'border-white/[0.08] bg-black/20 hover:border-[#d4b34a]/35'}`}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">
        node {node.id} · {node.node_type}
      </div>
      <div className="mt-2 text-sm text-[#f5f0e8]">{node.label || node.canonical_key}</div>
      {node.label && node.label !== node.canonical_key ? (
        <div className="mt-1 break-all text-xs text-[#cfc8b8]/65">{node.canonical_key}</div>
      ) : null}
    </button>
  );
}

function EvidenceRow({ edge }: { edge: CalyxEdge }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/18 p-3 text-xs text-[#cfc8b8]/80">
      <div className="flex flex-wrap items-center gap-2 text-[#f5f0e8]">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">edge {edge.id}</span>
        <span>{edge.edge_type}</span>
        <span>{edge.from_node_id} → {edge.to_node_id}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span>confidence: {edge.confidence_score == null ? 'not supplied' : percent(edge.confidence_score)}</span>
        <span>evidence: {edge.evidence_class || 'unclassified'}</span>
        <span>source: {edge.source_table || 'unknown'}{edge.source_pk ? ` / ${edge.source_pk}` : ''}</span>
      </div>
    </div>
  );
}

const CalyxInterface: React.FC = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AsyncState>('idle');

  const [canonicalKey, setCanonicalKey] = useState('');
  const [nodeType, setNodeType] = useState('');
  const [nodes, setNodes] = useState<CalyxNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<CalyxNode | null>(null);
  const [relationships, setRelationships] = useState<CalyxEdge[]>([]);

  const [inferenceType, setInferenceType] = useState<CalyxInferenceType>('habitat_similarity');
  const [inference, setInference] = useState<CalyxInferenceResponse | null>(null);
  const [selectedResult, setSelectedResult] = useState<CalyxInferenceResult | null>(null);

  const [ledgerId, setLedgerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [expectedVersion, setExpectedVersion] = useState('1');
  const [submissionResult, setSubmissionResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void validateOwnerSession()
      .then((session) => setIsUnlocked(session.authenticated))
      .catch(() => setIsUnlocked(false));
  }, []);

  const unlock = async () => {
    setError(null);
    try {
      await createOwnerSession(accessCode.trim());
      setAccessCode('');
      setIsUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Owner session failed');
    }
  };

  const lock = async () => {
    await endOwnerSession().catch(() => undefined);
    setIsUnlocked(false);
    setNodes([]);
    setSelectedNode(null);
    setInference(null);
    setSelectedResult(null);
    setSubmissionResult(null);
  };

  const searchGraph = async () => {
    setStatus('loading');
    setError(null);
    setInference(null);
    setSelectedResult(null);
    try {
      const response = await queryCalyxGraph({
        canonicalKey: canonicalKey.trim() || undefined,
        nodeType: nodeType.trim() || undefined,
        limit: 100,
      });
      setNodes(response.nodes ?? []);
      setSelectedNode(response.nodes?.[0] ?? null);
      setStatus('ready');
      if (!response.nodes?.length) setError('No canonical graph nodes matched that query.');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Graph query failed');
    }
  };

  useEffect(() => {
    if (!selectedNode) {
      setRelationships([]);
      return;
    }
    void fetchCalyxRelationships(selectedNode.id)
      .then(setRelationships)
      .catch((err) => setError(err instanceof Error ? err.message : 'Relationship lookup failed'));
  }, [selectedNode]);

  const runInference = async () => {
    if (!selectedNode) return;
    setStatus('loading');
    setError(null);
    setSubmissionResult(null);
    try {
      const response = await runCalyxInference(selectedNode.id, inferenceType, 25);
      setInference(response);
      setSelectedResult(response.results?.[0] ?? null);
      setStatus('ready');
      if (!response.results?.length) setError('Calyx found no candidate inference for this node and rule family.');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Inference failed');
    }
  };

  const submitToLedger = async () => {
    if (!selectedNode || !selectedResult) return;
    const version = Number(expectedVersion);
    if (!ledgerId.trim() || !projectId.trim() || !Number.isInteger(version) || version < 1) {
      setError('Ledger ID, project ID, and a valid expected ledger version are required.');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const response = await submitCalyxInferenceToLedger({
        subjectNodeId: selectedNode.id,
        ledgerId: ledgerId.trim(),
        projectId: projectId.trim(),
        expectedVersion: version,
        inferenceType,
        candidateNodeId: selectedResult.candidate_node_id,
        inferenceContentHash: selectedResult.inference_content_hash,
      });
      setSubmissionResult(response);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Ledger submission failed');
    }
  };

  const evidence = selectedResult?.evidence ?? [];
  const governance = inference?.governance;
  const resultCount = inference?.results.length ?? 0;
  const relationshipTypes = useMemo(
    () => Array.from(new Set(relationships.map((edge) => edge.edge_type))).sort(),
    [relationships],
  );

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
        <Navbar />
        <main className="flex min-h-screen items-center justify-center px-6 pt-24">
          <section className="w-full max-w-xl rounded-[2rem] border border-[#d4b34a]/25 bg-[#0d1d13]/95 p-8 shadow-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a]">
              <LockKeyhole className="h-4 w-4" /> Governed owner workspace
            </div>
            <h1 className="mt-6 text-4xl md:text-5xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              Speak with Calyx
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#cfc8b8]/82">
              Explore canonical graph evidence, run deterministic scientific inference, inspect the rule trace, and submit selected candidates into the Reasoning Ledger for review. Nothing here automatically approves or publishes knowledge.
            </p>
            {error ? <div className="mt-5 rounded-xl border border-red-300/25 bg-red-300/10 p-3 text-sm text-red-100">{error}</div> : null}
            <label className="mt-7 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#c9a24a]">Owner access code</label>
            <input
              type="password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void unlock(); }}
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 outline-none focus:border-[#d4b34a]/60"
            />
            <button onClick={() => void unlock()} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#11180e]">
              <KeyRound className="h-4 w-4" /> Unlock Calyx
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="pt-20">
        <section className="border-b border-white/[0.08] bg-[#09170f]">
          <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/30 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a]">
                  <BrainCircuit className="h-4 w-4" /> Calyx reasoning center
                </div>
                <h1 className="mt-5 text-4xl md:text-6xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Speak with Calyx</h1>
                <p className="mt-4 max-w-4xl text-[15px] leading-7 text-[#cfc8b8]/84">
                  A governed interface to the live Knowledge Graph and Reasoning Ledger. Calyx recomputes every inference from canonical graph evidence and preserves review, approval, and publication boundaries.
                </p>
              </div>
              <button onClick={() => void lock()} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] hover:border-[#d4b34a]/60">
                <LockKeyhole className="h-4 w-4" /> Lock
              </button>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-[1600px] gap-5 px-5 py-6 lg:grid-cols-[390px_minmax(0,1fr)] lg:px-8">
          <div className="space-y-5">
            <Panel title="1 · Find canonical subject" icon={Search}>
              <label className="text-xs text-[#cfc8b8]/75">Canonical key</label>
              <input value={canonicalKey} onChange={(e) => setCanonicalKey(e.target.value)} placeholder="Example: taxon:Orchidaceae..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[#d4b34a]/60" />
              <label className="mt-4 block text-xs text-[#cfc8b8]/75">Node type (optional)</label>
              <input value={nodeType} onChange={(e) => setNodeType(e.target.value)} placeholder="species, habitat, pollinator..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[#d4b34a]/60" />
              <button onClick={() => void searchGraph()} disabled={status === 'loading'} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d4b34a] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#11180e] disabled:opacity-50">
                {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search graph
              </button>
              <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
                {nodes.map((node) => <NodeCard key={node.id} node={node} selected={selectedNode?.id === node.id} onSelect={() => setSelectedNode(node)} />)}
              </div>
            </Panel>

            <Panel title="2 · Choose reasoning family" icon={Sparkles}>
              <select value={inferenceType} onChange={(e) => setInferenceType(e.target.value as CalyxInferenceType)} className="w-full rounded-xl border border-white/10 bg-[#07120b] px-3 py-3 text-sm outline-none focus:border-[#d4b34a]/60">
                {CALYX_INFERENCE_TYPES.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
              </select>
              <button onClick={() => void runInference()} disabled={!selectedNode || status === 'loading'} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d4b34a]/45 bg-[#d4b34a]/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#e7cc76] disabled:opacity-40">
                <BrainCircuit className="h-4 w-4" /> Ask Calyx to reason
              </button>
            </Panel>
          </div>

          <div className="space-y-5">
            {error ? <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div> : null}

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel title="Canonical graph context" icon={Network}>
                {selectedNode ? (
                  <>
                    <div className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{selectedNode.label || selectedNode.canonical_key}</div>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c9a24a]">node {selectedNode.id} · {selectedNode.node_type}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {relationshipTypes.map((type) => <span key={type} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[#cfc8b8]/75">{humanize(type)}</span>)}
                    </div>
                    <div className="mt-4 text-sm text-[#cfc8b8]/78">{relationships.length} outgoing relationships loaded.</div>
                  </>
                ) : <div className="text-sm text-[#cfc8b8]/70">Search for and select a canonical graph node.</div>}
              </Panel>

              <Panel title="Governance state" icon={ShieldCheck}>
                <div className="space-y-3 text-sm text-[#cfc8b8]/82">
                  <div className="flex items-center justify-between gap-3"><span>Output state</span><span className="text-[#f5f0e8]">{governance?.status || 'not generated'}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Candidate results</span><span className="text-[#f5f0e8]">{resultCount}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Human review required</span><span className="text-[#f5f0e8]">{governance ? String(governance.human_review_required) : 'yes'}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Automatic publication</span><span className="text-[#f5f0e8]">no</span></div>
                </div>
              </Panel>
            </div>

            <Panel title="Candidate inferences" icon={GitBranch}>
              {inference?.results.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {inference.results.map((result) => (
                    <button key={result.inference_content_hash} onClick={() => setSelectedResult(result)} className={`rounded-xl border p-4 text-left ${selectedResult?.inference_content_hash === result.inference_content_hash ? 'border-[#d4b34a]/65 bg-[#d4b34a]/10' : 'border-white/[0.08] bg-black/18 hover:border-[#d4b34a]/30'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">candidate node {result.candidate_node_id}</span>
                        <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-100">{percent(result.confidence)}</span>
                      </div>
                      <div className="mt-3 text-sm text-[#f5f0e8]">{humanize(result.proposed_relationship.predicate)}</div>
                      <div className="mt-1 break-all text-xs text-[#cfc8b8]/65">{result.proposed_relationship.object_canonical_key}</div>
                      <div className="mt-3 text-xs text-[#cfc8b8]/70">{result.evidence_edge_ids.length} evidence edges · {result.rule_id}@{result.rule_version}</div>
                    </button>
                  ))}
                </div>
              ) : <div className="text-sm text-[#cfc8b8]/70">Run an inference to generate reviewable candidates.</div>}
            </Panel>

            {selectedResult ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                <Panel title="Evidence and rule trace" icon={BookOpenCheck}>
                  <div className="space-y-3">{evidence.map((edge) => <EvidenceRow key={edge.id} edge={edge} />)}</div>
                  <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/18 p-4">
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">Deterministic trace</div>
                    <ol className="mt-3 space-y-2 text-sm text-[#cfc8b8]/80">
                      {selectedResult.rule_trace.map((step) => <li key={`${step.step}-${step.kind}`}><span className="text-[#f5f0e8]">{step.step}. {humanize(step.kind)}:</span> {JSON.stringify(step.value)}</li>)}
                    </ol>
                  </div>
                </Panel>

                <Panel title="3 · Submit to Reasoning Ledger" icon={Send}>
                  <p className="text-sm leading-6 text-[#cfc8b8]/78">Submission creates or reuses an immutable candidate entry. It does not approve the conclusion and does not publish to the Knowledge Graph.</p>
                  <label className="mt-4 block text-xs text-[#cfc8b8]/75">Ledger UUID</label>
                  <input value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[#d4b34a]/60" />
                  <label className="mt-4 block text-xs text-[#cfc8b8]/75">Research project UUID</label>
                  <input value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[#d4b34a]/60" />
                  <label className="mt-4 block text-xs text-[#cfc8b8]/75">Expected ledger version</label>
                  <input type="number" min="1" value={expectedVersion} onChange={(e) => setExpectedVersion(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[#d4b34a]/60" />
                  <button onClick={() => void submitToLedger()} disabled={status === 'loading'} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d4b34a] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.17em] text-[#11180e] disabled:opacity-50">
                    {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Submit candidate
                  </button>
                  {submissionResult ? (
                    <div className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm text-emerald-100">
                      <CheckCircle2 className="mr-2 inline h-4 w-4" /> Candidate accepted by the governed ledger bridge.
                      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-emerald-50/75">{JSON.stringify(submissionResult, null, 2)}</pre>
                    </div>
                  ) : null}
                </Panel>
              </div>
            ) : null}

            <Panel title="What this interface does not do" icon={Database}>
              <div className="grid gap-3 text-sm text-[#cfc8b8]/78 md:grid-cols-3">
                <div className="rounded-xl border border-white/[0.08] bg-black/18 p-4"><Link2 className="mb-3 h-4 w-4 text-[#c9a24a]" />It does not create alternate graph records or bypass canonical identities.</div>
                <div className="rounded-xl border border-white/[0.08] bg-black/18 p-4"><ShieldCheck className="mb-3 h-4 w-4 text-[#c9a24a]" />It does not turn confidence into approval or publication authority.</div>
                <div className="rounded-xl border border-white/[0.08] bg-black/18 p-4"><BookOpenCheck className="mb-3 h-4 w-4 text-[#c9a24a]" />It does not store private chain-of-thought; only reviewable evidence and rule traces are shown.</div>
              </div>
            </Panel>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CalyxInterface;
