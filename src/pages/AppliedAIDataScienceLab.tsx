import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Beaker,
  BookOpenCheck,
  CheckCircle2,
  FlaskConical,
  LockKeyhole,
  Microscope,
  Network,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import PageShell from '@/components/orchid/PageShell';
import { useAuth } from '@/contexts/AuthContext';
import { atlasApi } from '@/lib/atlas';
import {
  AI_DATA_SCIENCE_MODULE_ID,
  AiDataScienceApiError,
  appliedAiDataScienceApi,
  atlasLayerToEducationalRows,
  researchStationHref,
  type ExecutedLab,
} from '@/lib/appliedAiDataScience';
import { createCalyxConversation, sendCalyxTurn } from '@/lib/calyxWorkspace';
import { universityApi } from '@/lib/universityApi';

function errorMessage(error: unknown): string {
  if (error instanceof AiDataScienceApiError) {
    return error.detail?.message ?? error.detail?.code ?? error.message;
  }
  return error instanceof Error ? error.message : 'The learning laboratory request failed.';
}

function number(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
    {children}
  </span>
);

const progression = [
  {
    label: 'LEARN',
    Icon: BookOpenCheck,
    body: 'Understand missingness, descriptive statistics, sampling bias, and evidence boundaries before touching the analysis.',
  },
  {
    label: 'APPLY',
    Icon: Beaker,
    body: 'Build an immutable plan over a bounded Atlas-derived table and inspect the plan before execution.',
  },
  {
    label: 'RESEARCH',
    Icon: Microscope,
    body: 'Promote the exact dataset, plan, hashes, outputs, and question into Research Station by reference.',
  },
];

export default function AppliedAIDataScienceLab() {
  const { session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof appliedAiDataScienceApi.prepare>> | null>(null);
  const [executed, setExecuted] = useState<ExecutedLab | null>(null);
  const [calyxAnswer, setCalyxAnswer] = useState<{ depth: string; answer: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const moduleQuery = useQuery({
    queryKey: ['oc-ai-ds-module', AI_DATA_SCIENCE_MODULE_ID],
    queryFn: appliedAiDataScienceApi.module,
    retry: false,
  });
  const capabilityQuery = useQuery({
    queryKey: ['university-capability'],
    queryFn: universityApi.capability,
    retry: false,
  });
  const atlasQuery = useQuery({
    queryKey: ['oc-ai-ds-atlas-occurrences'],
    queryFn: async () => {
      const result = await atlasApi.occurrences();
      if (result.error) throw result.error;
      if (!result.data) {
        throw new Error(
          result.unconfigured
            ? 'The Atlas API is not configured for this deployment.'
            : 'The Atlas returned no governed occurrence layer.',
        );
      }
      return result.data;
    },
    retry: false,
  });

  const rows = useMemo(
    () => (atlasQuery.data ? atlasLayerToEducationalRows(atlasQuery.data, 1000) : []),
    [atlasQuery.data],
  );
  const localElevationComplete = useMemo(
    () => rows.filter((row) => typeof row.elevation_m === 'number').length,
    [rows],
  );

  const prepare = useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error('Sign in before preparing a reproducible laboratory.');
      if (!atlasQuery.data) throw new Error('The governed Atlas occurrence layer is not available.');
      return appliedAiDataScienceApi.prepare(
        {
          rows,
          provenance: {
            source: 'Orchid Continuum Atlas',
            source_contract: 'atlasApi.occurrences',
            feature_count_received: atlasQuery.data.features.length,
            educational_rows_forwarded: rows.length,
            exact_coordinates_forwarded: false,
          },
          selection: {
            maximum_rows: 1000,
            bounded_from_current_atlas_order: true,
            coordinates_omitted_before_submission: true,
          },
          recorded_at: new Date().toISOString(),
        },
        accessToken,
      );
    },
    onSuccess: (value) => {
      setPrepared(value);
      setExecuted(null);
      setCalyxAnswer(null);
      setMessage(null);
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const execute = useMutation({
    mutationFn: async () => {
      if (!accessToken || !prepared) throw new Error('Prepare the laboratory first.');
      return appliedAiDataScienceApi.execute(
        prepared.lab_manifest.project_id,
        prepared.lab_manifest.lab_manifest_id,
        new Date().toISOString(),
        accessToken,
      );
    },
    onSuccess: (value) => {
      setExecuted(value);
      setCalyxAnswer(null);
      setMessage(null);
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const askCalyx = useMutation({
    mutationFn: async (depth: 'beginner' | 'research') => {
      if (!executed) throw new Error('Execute the lab before asking Calyx to interpret it.');
      const conversation = await createCalyxConversation({
        title: `Orchid University · ${depth} explanation`,
        project_id: executed.project_id,
        context: {
          ...executed.calyx_context,
          source_surface: 'orchid-university',
          audience_depth: depth,
          is_evidence: false,
        },
      });
      const prompt =
        depth === 'beginner'
          ? 'Explain this completed Orchid University statistics lab in plain language. Focus on what the descriptive results support, what missing data and sampling concentration mean, and what the learner should not conclude. Treat your explanation as non-evidentiary.'
          : 'Explain this completed Orchid University statistics lab at research depth. Audit the method assumptions, missingness, sampling-bias diagnostics, provenance boundaries, and defensible next analyses. Do not convert your explanation into source evidence or a scientific conclusion.';
      const turn = await sendCalyxTurn(conversation.conversation_id, {
        message: prompt,
        project_id: executed.project_id,
        context: {
          ...executed.calyx_context,
          audience_depth: depth,
          is_evidence: false,
        },
        research_mode: 'never',
      });
      return { depth, answer: turn.answer };
    },
    onSuccess: (value) => {
      setCalyxAnswer(value);
      setMessage(null);
    },
    onError: (error) =>
      setMessage(
        error instanceof Error
          ? `Calyx explanation is unavailable: ${error.message}`
          : 'Calyx explanation is unavailable.',
      ),
  });

  const chartData = useMemo(() => {
    const points = executed?.visualization_payload.series?.elevation_m?.points ?? [];
    return points.slice(0, 60).map((point) => ({
      record: point.row_index + 1,
      elevation: point.value,
    }));
  }, [executed]);

  const canWrite = capabilityQuery.data?.session_writes_enabled === true;
  const busy = prepare.isPending || execute.isPending || askCalyx.isPending;

  return (
    <PageShell
      eyebrow="Orchid Continuum University · Applied AI & Data Science"
      title="Exploratory orchid"
      titleAccent="data science"
      intro="Learn descriptive statistics with a bounded Orchid Continuum occurrence-and-elevation view, inspect the scientific limits before execution, then carry the same checksum-bound analysis into Research Station."
    >
      <section className="mx-auto max-w-7xl space-y-8 px-6 py-12 lg:px-10">
        {message && (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-5 text-sm text-amber-50">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{message}</p>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {progression.map(({ label, Icon, body }) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <Icon className="mb-4 h-5 w-5 text-emerald-200" />
              <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-emerald-200/80">{label}</div>
              <p className="text-sm leading-relaxed text-white/70">{body}</p>
            </article>
          ))}
        </div>

        {moduleQuery.isLoading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-white/65">
            Loading the versioned learning module…
          </div>
        )}

        {moduleQuery.isError && (
          <div className="rounded-2xl border border-red-300/25 bg-red-300/[0.05] p-8 text-white/75">
            The OC-AI-DS-001 module contract is not available from the current backend release.
          </div>
        )}

        {moduleQuery.data && (
          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.035] p-7 md:p-9">
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge>{moduleQuery.data.module_id}</Badge>
                <Badge>v{moduleQuery.data.module_version}</Badge>
                <Badge>{moduleQuery.data.status}</Badge>
              </div>
              <h2 className="font-serif text-3xl text-white">{moduleQuery.data.title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">{moduleQuery.data.summary}</p>
              <h3 className="mt-7 text-xs uppercase tracking-[0.2em] text-emerald-100">Learning objectives</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/75">
                {moduleQuery.data.learning_objectives.map((objective) => (
                  <li key={objective}>• {objective}</li>
                ))}
              </ul>
            </article>

            <aside className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.03] p-7 md:p-9">
              <div className="mb-4 flex items-center gap-2 text-amber-100">
                <ShieldCheck className="h-5 w-5" />
                <h2 className="font-serif text-2xl">Scientific cautions</h2>
              </div>
              <ul className="space-y-3 text-sm leading-relaxed text-white/70">
                {moduleQuery.data.scientific_cautions.map((caution) => (
                  <li key={caution}>• {caution}</li>
                ))}
              </ul>
            </aside>
          </section>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-7 md:p-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-sky-200/80">Governed dataset</div>
              <h2 className="mt-2 font-serif text-3xl text-white">Atlas occurrence + elevation view</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
                Atlas coordinates are used by the map, but this laboratory deliberately forwards none of them.
                Only taxon identity, generalized geography, date/elevation fields, source, license, and record type enter the educational table.
              </p>
            </div>
            <BarChart3 className="h-7 w-7 text-sky-200" />
          </div>

          {atlasQuery.isLoading && <p className="mt-6 text-sm text-white/60">Loading the current governed Atlas layer…</p>}
          {atlasQuery.isError && (
            <p className="mt-6 text-sm text-amber-100">
              Atlas data is unavailable. No fixture data is substituted for the executable lab.
            </p>
          )}
          {atlasQuery.data && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Atlas features" value={String(atlasQuery.data.features.length)} />
              <Metric label="Bounded table rows" value={String(rows.length)} />
              <Metric label="Elevation values visible" value={String(localElevationComplete)} />
              <Metric label="Coordinates forwarded" value="0" />
            </div>
          )}

          <div className="mt-7 border-t border-white/10 pt-6">
            {authLoading ? (
              <p className="text-sm text-white/60">Checking learner identity…</p>
            ) : !accessToken ? (
              <div className="flex flex-wrap items-center gap-4">
                <LockKeyhole className="h-5 w-5 text-amber-200" />
                <p className="text-sm text-white/70">Sign in to create the private, reproducible Research Station record.</p>
                <Link className="rounded-full border border-amber-200/30 px-4 py-2 text-sm text-amber-100" to="/account">
                  Sign in
                </Link>
              </div>
            ) : !canWrite ? (
              <p className="text-sm text-amber-100">
                This backend release has University session writes disabled. The lesson remains inspectable, but execution fails closed until the governed write gate is active.
              </p>
            ) : (
              <button
                type="button"
                disabled={busy || rows.length === 0 || localElevationComplete < 2}
                onClick={() => prepare.mutate()}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-300/10 px-5 py-2.5 text-sm text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FlaskConical className="h-4 w-4" />
                {prepare.isPending ? 'Preparing…' : prepared ? 'Reprepare same governed lab' : 'Prepare governed lab'}
              </button>
            )}
          </div>
        </section>

        {prepared && (
          <section className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.03] p-7 md:p-9">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-violet-200/80">Inspect before execution</div>
                <h2 className="mt-2 font-serif text-3xl text-white">Immutable lab manifest</h2>
              </div>
              <Badge>{prepared.created ? 'new manifest' : 'reused manifest'}</Badge>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Rows" value={String(prepared.lab_manifest.dataset.row_count)} />
              <Metric label="Elevation missing" value={percent(prepared.lab_manifest.dataset.quality.elevation.missing_fraction)} />
              <Metric label="Method" value={prepared.lab_manifest.analysis_plan.method} />
              <Metric label="Arbitrary code" value={prepared.lab_manifest.execution.arbitrary_code_execution ? 'Enabled' : 'Disabled'} />
            </div>

            <div className="mt-7 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/10 p-5">
                <h3 className="font-medium text-white">Question</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{prepared.lab_manifest.question}</p>
                <h3 className="mt-5 font-medium text-white">Declared variables</h3>
                <p className="mt-2 text-sm text-white/70">
                  {(prepared.lab_manifest.analysis_plan.parameters.columns ?? []).join(', ')}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-5">
                <h3 className="font-medium text-white">Sampling / data-quality warnings</h3>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-white/70">
                  {prepared.lab_manifest.dataset.quality.warnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              </div>
            </div>

            <details className="mt-6 rounded-xl border border-white/10 bg-black/10 p-5">
              <summary className="cursor-pointer text-sm font-medium text-white">Provenance and reproducibility identity</summary>
              <dl className="mt-4 grid gap-3 text-xs text-white/65 md:grid-cols-2">
                <HashItem label="Dataset SHA-256" value={prepared.lab_manifest.dataset.rows_sha256} />
                <HashItem label="Manifest SHA-256" value={prepared.lab_manifest.manifest_sha256} />
                <HashItem label="Plan ID" value={prepared.lab_manifest.analysis_plan.plan_id} />
                <HashItem label="Project ID" value={prepared.lab_manifest.project_id} />
              </dl>
            </details>

            <button
              type="button"
              disabled={busy}
              onClick={() => execute.mutate()}
              className="mt-7 inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-violet-300/10 px-5 py-2.5 text-sm text-violet-50 disabled:opacity-40"
            >
              <RefreshCcw className="h-4 w-4" />
              {execute.isPending ? 'Executing and replaying…' : 'Execute exact plan'}
            </button>
          </section>
        )}

        {executed && (
          <>
            <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.035] p-7 md:p-9">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-200/80">Computed output</div>
                  <h2 className="mt-2 font-serif text-3xl text-white">Descriptive results</h2>
                </div>
                <div className="inline-flex items-center gap-2 text-sm text-emerald-100">
                  <CheckCircle2 className="h-5 w-5" />
                  Replay verified
                </div>
              </div>

              <div className="mt-7 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-white/50">
                    <tr>
                      <th className="py-3">Variable</th>
                      <th>n</th>
                      <th>Missing</th>
                      <th>Mean</th>
                      <th>Median</th>
                      <th>SD</th>
                      <th>Min</th>
                      <th>Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(executed.result_table.columns).map(([name, stats]) => (
                      <tr key={name} className="border-b border-white/[0.06] text-white/75">
                        <td className="py-3 font-medium text-white">{name}</td>
                        <td>{stats.n}</td>
                        <td>{stats.missing}</td>
                        <td>{number(stats.mean)}</td>
                        <td>{number(stats.median)}</td>
                        <td>{number(stats.sample_sd)}</td>
                        <td>{number(stats.min)}</td>
                        <td>{number(stats.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {chartData.length > 0 && (
                <div className="mt-8 h-72 rounded-xl border border-white/10 bg-black/10 p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/50">
                    Elevation values · first {chartData.length} complete plotted records
                  </div>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="record" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="elevation" fill="currentColor" className="text-emerald-300" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/10 p-5">
                  <h3 className="font-medium text-white">Engine warnings</h3>
                  <ul className="mt-2 space-y-2 text-sm text-white/70">
                    {executed.warnings.length ? executed.warnings.map((warning) => <li key={warning}>• {warning}</li>) : <li>• No method warning was emitted.</li>}
                  </ul>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-5">
                  <h3 className="font-medium text-white">Reproducibility proof</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    The exact plan was executed twice. Analysis ID, input hash, result hash, and receipt hash matched.
                    The second execution reused the content-addressed result: {executed.replay_proof.second_execution_reused_analysis ? 'yes' : 'no'}.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.03] p-7 md:p-9">
                <div className="mb-4 flex items-center gap-2 text-sky-100">
                  <Network className="h-5 w-5" />
                  <h2 className="font-serif text-2xl">Ask Calyx to explain</h2>
                </div>
                <p className="text-sm leading-relaxed text-white/70">
                  Calyx receives the computed result, diagnostics, and provenance references as context.
                  Its explanation is explicitly non-evidentiary and is not promoted into the dataset or scientific record.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => askCalyx.mutate('beginner')}
                    className="rounded-full border border-sky-300/30 px-4 py-2 text-sm text-sky-100 disabled:opacity-40"
                  >
                    Beginner explanation
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => askCalyx.mutate('research')}
                    className="rounded-full border border-sky-300/30 px-4 py-2 text-sm text-sky-100 disabled:opacity-40"
                  >
                    Research-depth audit
                  </button>
                </div>
                {calyxAnswer && (
                  <div className="mt-6 rounded-xl border border-white/10 bg-black/10 p-5">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-sky-200">
                      {calyxAnswer.depth} · generated explanation · not evidence
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/75">{calyxAnswer.answer}</p>
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.03] p-7 md:p-9">
                <h2 className="font-serif text-2xl text-white">Interpret before you continue</h2>
                <div className="mt-5 space-y-4">
                  {executed.assessment.prompts.map((prompt, index) => (
                    <div key={prompt.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/80">Reflection {index + 1}</div>
                      <p className="mt-2 text-sm leading-relaxed text-white/75">{prompt.prompt}</p>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.045] p-7 md:p-9">
              <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-200/80">Research continuation</div>
                  <h2 className="mt-2 font-serif text-3xl text-white">Continue with the same evidence in Research Station</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
                    The handoff is by reference: project, dataset, manifest, analysis plan, result, diagnostic, hashes, provenance, and review state stay linked.
                    Nothing in this educational result becomes published or canonical knowledge automatically.
                  </p>
                </div>
                <Link
                  to={researchStationHref(executed.research_promotion_packet)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-300/10 px-5 py-2.5 text-sm text-emerald-50"
                >
                  Continue in Research Station
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <details className="mt-6 rounded-xl border border-white/10 bg-black/10 p-5">
                <summary className="cursor-pointer text-sm font-medium text-white">Promotion identity</summary>
                <dl className="mt-4 grid gap-3 text-xs text-white/65 md:grid-cols-2">
                  <HashItem label="Promotion ID" value={executed.research_promotion_packet.promotion_id} />
                  <HashItem label="Analysis ID" value={executed.research_promotion_packet.analysis_result.analysis_id} />
                  <HashItem label="Result SHA-256" value={executed.research_promotion_packet.analysis_result.result_sha256} />
                  <HashItem label="Dataset SHA-256" value={executed.research_promotion_packet.dataset.rows_sha256} />
                </dl>
              </details>
            </section>
          </>
        )}
      </section>
    </PageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-2 text-xl text-white">{value}</div>
    </div>
  );
}

function HashItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="uppercase tracking-[0.16em] text-white/40">{label}</dt>
      <dd className="mt-1 break-all font-mono text-white/70">{value}</dd>
    </div>
  );
}
