import { useEffect, useState } from 'react';

import { WorkspaceOutputPanel } from './WorkspaceOutputPanel';
import {
  subscribeWorkspaceOutputClears,
  subscribeWorkspaceOutputs,
  type WorkspaceOutput,
} from './workspaceOutputBus';

export function WorkspaceOutputDock({
  title = 'Calyx workspace outputs',
  emptyMessage = 'Tool-produced panels will appear here when a connected Orchid Continuum module returns them.',
  limit = 8,
}: {
  title?: string;
  emptyMessage?: string;
  limit?: number;
}) {
  const [outputs, setOutputs] = useState<WorkspaceOutput[]>([]);

  useEffect(() => {
    const unsubscribeOutputs = subscribeWorkspaceOutputs((output) => {
      setOutputs((current) => {
        const withoutExisting = current.filter((item) => item.id !== output.id);
        return [...withoutExisting, output].slice(-limit);
      });
    });
    const unsubscribeClears = subscribeWorkspaceOutputClears((sourceModule) => {
      setOutputs((current) => current.filter((item) => item.provenance.source_module !== sourceModule));
    });
    return () => {
      unsubscribeOutputs();
      unsubscribeClears();
    };
  }, [limit]);

  return (
    <section className="rounded-2xl border bg-card p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Adaptive workspace</p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        </div>
        {outputs.length > 0 && <span className="rounded-full border px-2.5 py-1 text-xs">{outputs.length} open</span>}
      </div>
      {outputs.length ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {outputs.map((output) => (
            <WorkspaceOutputPanel
              key={output.id}
              output={output}
              onClose={() => setOutputs((current) => current.filter((item) => item.id !== output.id))}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
