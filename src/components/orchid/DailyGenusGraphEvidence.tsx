import React, { useEffect, useState } from 'react';
import { AlertCircle, Database, Loader2 } from 'lucide-react';
import {
  fetchGenusGraphEvidence,
  type GenusGraphEvidence,
  type GenusGraphResult,
  type KnowledgeGraphDomain,
} from '@/lib/knowledgeGraph';

const DOMAIN_LABELS: Record<KnowledgeGraphDomain, string> = {
  taxonomy: 'Taxonomy',
  media: 'Media',
  occurrences: 'Occurrences',
  traits: 'Traits',
  literature: 'Literature',
  pollinators: 'Pollinators',
  conservation: 'Conservation',
};

type ViewState = { status: 'loading' } | GenusGraphResult;

function evidenceCount(nodes: number, edges: number): string {
  const nodeLabel = nodes === 1 ? 'node' : 'nodes';
  const edgeLabel = edges === 1 ? 'link' : 'links';
  return `${nodes} ${nodeLabel} / ${edges} ${edgeLabel}`;
}

const StatusMessage: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="mt-4 flex gap-3 rounded-lg border border-[#dfd1ad] bg-[#fffaf0] p-4" role="status">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6f2d]" />
    <div>
      <p className="text-sm font-medium text-[#3a4630]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#6e765f]">{body}</p>
    </div>
  </div>
);

const EvidenceGrid: React.FC<{ evidence: GenusGraphEvidence }> = ({ evidence }) => (
  <>
    {evidence.truncated && (
      <StatusMessage
        title="Partial graph evidence"
        body="This traversal reached its public response limit. Counts below describe only the returned page."
      />
    )}
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {evidence.domains.map(({ domain, nodes, edges }) => {
        const hasEvidence = nodes > 0 || edges > 0;
        return (
          <article key={domain} className="rounded-lg border border-[#dfd1ad] bg-[#fffaf0] p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a6f2d]">
              {DOMAIN_LABELS[domain]}
            </p>
            <p className="mt-2 text-sm text-[#3a4630]">
              {hasEvidence ? evidenceCount(nodes, edges) : 'No evidence in this traversal'}
            </p>
          </article>
        );
      })}
    </div>
    <p className="mt-4 text-xs leading-5 text-[#6e765f]">
      Returned graph: {evidence.nodeCount} connected nodes and {evidence.edgeCount} links. Counts reflect graph-backed evidence, not completeness of scientific knowledge.
    </p>
  </>
);

const DailyGenusGraphEvidence: React.FC<{ genus: string }> = ({ genus }) => {
  const [state, setState] = useState<ViewState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchGenusGraphEvidence(genus, controller.signal).then(setState).catch(() => {
      if (!controller.signal.aborted) setState({ status: 'unavailable' });
    });
    return () => controller.abort();
  }, [genus]);

  return (
    <section className="rounded-lg border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]" aria-labelledby="graph-evidence-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Knowledge Graph Evidence</p>
          <h3 id="graph-evidence-title" className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">Connected evidence for {genus}</h3>
          <p className="mt-2 text-sm leading-6 text-[#5d684c]">A read-only, two-hop view of published graph relationships.</p>
        </div>
        <Database className="h-5 w-5 shrink-0 text-[#8a6f2d]" />
      </div>

      {state.status === 'loading' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#5d684c]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading graph evidence…
        </div>
      )}
      {state.status === 'not_found' && <StatusMessage title="No graph record found" body={`No published genus node is available for ${genus}.`} />}
      {state.status === 'unavailable' && <StatusMessage title="Graph evidence unavailable" body="The public graph service could not be reached. The curated Featured Genus content remains available above." />}
      {state.status === 'invalid' && <StatusMessage title="Graph response could not be verified" body="No graph counts are shown because the response did not match the public evidence contract." />}
      {state.status === 'ok' && <EvidenceGrid evidence={state.evidence} />}
    </section>
  );
};

export default DailyGenusGraphEvidence;
