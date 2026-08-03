import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, GitBranch, Image as ImageIcon, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchHomepageReadiness, HomepageReadinessResult, LiveMetric } from '@/lib/homepageReadiness';

function formatCount(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : 'Unavailable';
}

function formatMetric(metric: LiveMetric | undefined) {
  if (!metric || metric.state !== 'available' || metric.value == null) return 'Unavailable';
  const count = metric.value.toLocaleString();
  return metric.percentage == null ? count : `${count} (${metric.percentage.toFixed(2)}%)`;
}

export default function HomepageReadiness() {
  const [result, setResult] = useState<HomepageReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setResult(await fetchHomepageReadiness());
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const audit = result?.status === 'live' ? result.audit : null;
  const relational = audit?.relational.taxonomy_to_images;
  const graph = audit?.graph;
  const publicationBlocked = !audit || !audit.homepage_ready;

  const recommendation = useMemo(() => {
    if (!audit) return 'Calyx readiness evidence is unavailable.';
    return audit.homepage_ready
      ? 'Calyx evidence gate: the measured image and graph gates pass.'
      : 'Calyx evidence gate: keep public homepage publication blocked while the listed graph blockers remain.';
  }, [audit]);

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Mission Control</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Knowledge Graph homepage readiness</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Live, read-only measurements from PostgreSQL. Relational image linkage and persisted Knowledge Graph materialization are reported separately.
            </p>
          </div>
          <Button onClick={() => void load()} disabled={loading} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh audit
          </Button>
        </div>

        {result?.status === 'unavailable' && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Readiness service unavailable</CardTitle>
              <CardDescription>{result.reason}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card className={publicationBlocked ? 'border-amber-500/40' : 'border-emerald-500/40'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {publicationBlocked ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              {publicationBlocked ? 'Public homepage publication blocked' : 'Measured homepage gates pass'}
            </CardTitle>
            <CardDescription>{recommendation}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Redesign and prototyping may continue. This dashboard does not authorize deployment, graph mutation, or scientific publication.
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Taxonomy records</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{formatCount(relational?.total_taxa)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" /> Image records</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{formatCount(relational?.total_images)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4" /> Persisted graph edges</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{formatCount(graph?.total_edges)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Taxonomy → image graph edges</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{formatMetric(graph?.taxonomy_to_images)}</CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Relational image linkage</CardTitle>
              <CardDescription>{relational?.taxonomy_table ?? 'Taxonomy table unavailable'} · {relational?.image_table ?? 'Image table unavailable'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <MetricRow label="Valid linked images" value={formatMetric(relational?.linked_images)} />
              <MetricRow label="Unlinked images" value={formatMetric(relational?.unlinked_images)} />
              <MetricRow label="Broken taxonomy targets" value={formatMetric(relational?.broken_taxonomy_targets)} />
              <MetricRow label="Taxa with images" value={formatMetric(relational?.taxa_with_images)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Knowledge Graph materialization</CardTitle>
              <CardDescription>{graph?.edge_table ?? 'No recognized graph-edge table'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <MetricRow label="Total edges" value={formatCount(graph?.total_edges)} />
              <MetricRow label="Taxonomy → image edges" value={formatMetric(graph?.taxonomy_to_images)} />
              <MetricRow label="Null endpoint edges" value={formatCount(graph?.integrity?.null_endpoint_edges)} />
              <MetricRow label="Duplicate edges" value={formatCount(graph?.integrity?.duplicate_edges)} />
              <MetricRow label="Integrity gate" value={graph?.integrity?.passed === true ? 'Pass' : graph?.integrity?.passed === false ? 'Fail' : 'Unavailable'} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Current blockers</CardTitle>
            <CardDescription>These values come from the backend readiness audit; the browser does not invent missing measurements.</CardDescription>
          </CardHeader>
          <CardContent>
            {!audit ? (
              <p className="text-sm text-muted-foreground">No verified audit is available.</p>
            ) : audit.blockers.length === 0 ? (
              <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4" /> No measured blockers.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {audit.blockers.map((blocker) => (
                  <li key={blocker} className="flex items-start gap-2 rounded-md border p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <code className="break-all">{blocker}</code>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {audit && <p className="text-xs text-muted-foreground">Generated {new Date(audit.generated_at).toLocaleString()} · {audit.warning}</p>}
      </div>
    </main>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-b-0"><span className="text-muted-foreground">{label}</span><strong className="text-right font-medium">{value}</strong></div>;
}
