import React, { useEffect, useMemo, useState } from 'react';
import type { LexiconEntry } from '@/data/types';
import { FlowerSchematic } from '@/components/lexicon/Schematics';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { readCalyxSessionContext } from './sessionContext';
import { subscribeWorkspaceOutputClears, subscribeWorkspaceOutputs, type WorkspaceOutput } from './workspaceOutputBus';
import { WorkspaceOutputPanel } from './WorkspaceOutputPanel';

const PanelFrame: React.FC<{ title: string; eyebrow: string; children: React.ReactNode }> = ({ title, eyebrow, children }) => (
  <section className="h-full overflow-auto rounded-sm border border-stone-200 bg-white p-4">
    <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#4A7C59]">{eyebrow}</p>
    <h3 className="mt-1 font-serif text-lg text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{title}</h3>
    <div className="mt-3">{children}</div>
  </section>
);

export const CalyxAdaptiveWorkspace: React.FC<{ entry: LexiconEntry; children: React.ReactNode }> = ({ entry, children }) => {
  const session = useMemo(() => readCalyxSessionContext(), [entry.slug]);
  const related = entry.related_terminology ?? [];
  const characterStates = entry.character_states ?? [];
  const literature = entry.literature ?? [];
  const overlayFields = entry.migration_overlay?.fields ?? [];
  const [outputs, setOutputs] = useState<WorkspaceOutput[]>([]);

  useEffect(() => subscribeWorkspaceOutputs((output) => {
    setOutputs((current) => {
      const withoutExisting = current.filter((item) => item.id !== output.id);
      return [...withoutExisting, output].slice(-6);
    });
  }), []);

  useEffect(() => subscribeWorkspaceOutputClears((sourceModule) => {
    setOutputs((current) => current.filter((item) => item.provenance.source_module !== sourceModule));
  }), []);

  // A new lexicon concept is a new interaction context - outputs opened by
  // tool calls made against the previous entry must not linger as if they
  // still describe this one.
  useEffect(() => setOutputs([]), [entry.slug]);

  const closeOutput = (id: string) => setOutputs((current) => current.filter((item) => item.id !== id));

  return (
    <section aria-label={`Calyx adaptive workspace for ${entry.preferred_term}`} className="overflow-hidden rounded-sm border border-[#8E3A6B]/20 bg-[#FBF8F3]">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#8E3A6B]">Adaptive workspace</p>
          <h2 className="font-serif text-xl text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Calyx + {entry.preferred_term}</h2>
        </div>
        <p className="ml-auto max-w-xl text-xs leading-relaxed text-stone-500">Conversation remains visible while Calyx context, visuals, identification characters and evidence occupy simultaneous panels. Tool-producing modules can open additional image, diagram, chart, table or text outputs through the shared workspace bus.</p>
        {overlayFields.length ? (
          <p className="w-full rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <strong>Migration overlay:</strong> the canonical Concept Registry remains authoritative for identity, reviewed definitions and provenance. The following displayed layers are still preserved from the Famous Lexicon migration until canonical equivalents are available: {overlayFields.join(', ')}.
          </p>
        ) : null}
      </header>
      <div className="h-[760px] min-h-[560px] p-2">
        <ResizablePanelGroup direction="horizontal" className="rounded-sm">
          <ResizablePanel defaultSize={52} minSize={34}>
            <div className="h-full overflow-auto pr-2">{children}</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={48} minSize={30}>
            <ResizablePanelGroup direction="vertical">
              {outputs.length ? <>
                <ResizablePanel defaultSize={42} minSize={24}>
                  <div className="h-full overflow-auto p-2">
                    <div className="grid gap-2 xl:grid-cols-2">
                      {outputs.map((output) => <WorkspaceOutputPanel key={output.id} output={output} onClose={() => closeOutput(output.id)} />)}
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
              </> : null}
              <ResizablePanel defaultSize={outputs.length ? 58 : 100} minSize={35}>
                <ResizablePanelGroup direction="vertical">
                  <ResizablePanel defaultSize={40} minSize={24}>
                    <div className="h-full p-2">
                      <PanelFrame eyebrow="Visual communication" title="Concept visual">
                        <FlowerSchematic flip={entry.slug === 'non-resupination'} className="mx-auto h-48 w-auto max-w-full" />
                        <p className="mt-2 text-center text-[11px] text-stone-500">Conceptual schematic · not specimen evidence</p>
                      </PanelFrame>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={32} minSize={20}>
                    <div className="grid h-full grid-cols-2 gap-2 p-2">
                      <PanelFrame eyebrow="Identification matrix" title="Character context">
                        {characterStates.length ? <ul className="space-y-2 text-xs text-stone-700">{characterStates.slice(0, 5).map((state) => <li key={state.label}><strong>{state.label}</strong>{state.description ? <span className="block text-stone-500">{state.description}</span> : null}</li>)}</ul> : <p className="text-xs text-stone-500">No reviewed character states are attached yet.</p>}
                      </PanelFrame>
                      <PanelFrame eyebrow="Knowledge connections" title="Related concepts">
                        {related.length ? <div className="flex flex-wrap gap-1.5">{related.slice(0, 10).map((term) => <span key={term} className="rounded-full border border-stone-300 px-2 py-1 text-[11px] text-stone-600">{term}</span>)}</div> : <p className="text-xs text-stone-500">Related terminology awaits enrichment.</p>}
                      </PanelFrame>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={28} minSize={18}>
                    <div className="grid h-full grid-cols-2 gap-2 p-2">
                      <PanelFrame eyebrow="Evidence" title="Literature in view">
                        {literature.length ? <ul className="space-y-2 text-xs text-stone-700">{literature.slice(0, 4).map((record) => <li key={record.id}>{record.title ?? 'Untitled literature record'}</li>)}</ul> : <p className="text-xs text-stone-500">No verified literature is attached to this concept yet.</p>}
                      </PanelFrame>
                      <PanelFrame eyebrow="Session awareness" title="Where you have been">
                        {session.trail.length ? <ol className="space-y-1 text-xs text-stone-600">{session.trail.slice(-5).reverse().map((item, index) => <li key={`${item.observed_at}-${index}`}><span className="font-medium text-stone-800">{item.label ?? item.object_id ?? item.surface}</span><span className="block text-[10px] uppercase tracking-wide text-stone-400">{item.module} · {item.surface}</span></li>)}</ol> : <p className="text-xs text-stone-500">This is the first recorded surface in the current session.</p>}
                      </PanelFrame>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </section>
  );
};
