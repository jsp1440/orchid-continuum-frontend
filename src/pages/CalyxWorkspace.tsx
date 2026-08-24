import type { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Scatter, ScatterChart, XAxis, YAxis } from "recharts";

import ScientificSynthesis from "@/components/calyx/ScientificSynthesis";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useCalyxSpeechInput } from "@/hooks/useCalyxSpeechInput";
import { useCalyxSpeechOutput } from "@/hooks/useCalyxSpeechOutput";
import {
  buildCalyxTurnContext,
  buildCalyxConversationExport,
  buildCalyxDocumentContextPrompt,
  buildStructuredWorkspacePreview,
  DEFAULT_PROJECT_ID,
  STORAGE_KEY,
  formatUploadedFileSize,
  isCalyxTextWorkspaceFile,
  normalizeProjectId,
  renderCalyxRichText,
  shouldReuseConversation,
  visibleConversationMessages,
} from "@/lib/calyxConversation";
import {
  CalyxApiError,
  createCalyxConversation,
  getBrainMission,
  getCalyxConversation,
  listCalyxConversations,
  loadCalyxWorkspace,
  sendCalyxTurn,
  type BrainMission,
  type CalyxCitation,
  type CalyxSynthesisStructure,
  type CalyxConversation,
  type CalyxWorkspaceSnapshot,
  type MissionEvidence,
  type MissionSource,
} from "@/lib/calyxWorkspace";

const emptySnapshot: CalyxWorkspaceSnapshot = {
  capabilities: null,
  homepage: null,
  orchestrator: null,
  orchestratorState: "unavailable",
  errors: [],
};

const MAX_TEXT_WORKSPACE_PREVIEW_BYTES = 512 * 1024;
const MAX_CALYX_MESSAGE_CHARS = 100000;
const MAX_HISTORICAL_MISSION_LOOKUPS = 3;
const NETWORK_RETRY_SECONDS = 20;

const CALYX_STARTER_QUESTIONS = [
  "What should we investigate first tonight?",
  "What evidence supports orchid resilience under climate stress?",
  "Summarize what is known versus uncertain for this orchid topic.",
  "What dataset or paper should I inspect next and why?",
  "Generate a chart-ready comparison I can verify.",
];

type CalyxChartArtifact = {
  kind: "chart";
  title: string;
  chartType: "bar" | "line";
  xLabel?: string;
  yLabel?: string;
  points: Array<{ label: string; value: number }>;
};

type CalyxMapArtifact = {
  kind: "map";
  title: string;
  points: Array<{ label?: string; lat: number; lon: number }>;
};

type CalyxImageArtifact = {
  kind: "image";
  title?: string;
  url: string;
  alt?: string;
  caption?: string;
  source?: string;
};

type CalyxArtifact = CalyxChartArtifact | CalyxMapArtifact | CalyxImageArtifact;

function parseCalyxArtifacts(content: string): { prose: string; artifacts: CalyxArtifact[] } {
  const artifacts: CalyxArtifact[] = [];
  const prose = content.replace(/```calyx-(chart|map|image)\s*\n([\s\S]*?)```/gi, (block, rawKind: string, rawJson: string) => {
    try {
      const value = JSON.parse(rawJson.trim()) as Record<string, unknown>;
      const kind = rawKind.toLowerCase();
      if (kind === "chart") {
        const points = Array.isArray(value.points)
          ? value.points
              .map((point) => {
                if (!point || typeof point !== "object") return null;
                const row = point as Record<string, unknown>;
                const numeric = Number(row.value);
                if (!Number.isFinite(numeric)) return null;
                return { label: String(row.label ?? ""), value: numeric };
              })
              .filter((point): point is { label: string; value: number } => Boolean(point))
          : [];
        if (points.length) {
          artifacts.push({
            kind: "chart",
            title: String(value.title ?? "CALYX chart"),
            chartType: value.chartType === "line" ? "line" : "bar",
            xLabel: typeof value.xLabel === "string" ? value.xLabel : undefined,
            yLabel: typeof value.yLabel === "string" ? value.yLabel : undefined,
            points,
          });
          return "";
        }
      }
      if (kind === "map") {
        const points = Array.isArray(value.points)
          ? value.points
              .map((point) => {
                if (!point || typeof point !== "object") return null;
                const row = point as Record<string, unknown>;
                const lat = Number(row.lat);
                const lon = Number(row.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
                return { label: typeof row.label === "string" ? row.label : undefined, lat, lon };
              })
              .filter((point): point is NonNullable<typeof point> => point !== null)
          : [];
        if (points.length) {
          artifacts.push({ kind: "map", title: String(value.title ?? "Geographic occurrence plot"), points });
          return "";
        }
      }
      if (kind === "image" && typeof value.url === "string" && /^https:\/\//i.test(value.url)) {
        artifacts.push({
          kind: "image",
          title: typeof value.title === "string" ? value.title : undefined,
          url: value.url,
          alt: typeof value.alt === "string" ? value.alt : undefined,
          caption: typeof value.caption === "string" ? value.caption : undefined,
          source: typeof value.source === "string" ? value.source : undefined,
        });
        return "";
      }
    } catch {
      return block;
    }
    return block;
  });
  return { prose: prose.trim(), artifacts };
}

function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }

    setElapsed(0);
    const intervalId = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, [active]);

  return elapsed;
}

function EvidenceList({ title, items }: { title: string; items: MissionEvidence[] }) {
  return (
    <section className="rounded-xl border p-5">
      <h3 className="font-semibold">{title} ({items.length})</h3>
      {items.length ? <ul className="mt-3 space-y-3">{items.map((item, index) => (
        <li className="rounded-lg bg-muted p-3 text-sm" key={`${String(item.candidate_id ?? "evidence")}-${index}`}>
          <p className="font-medium">{String(item.subject ?? "Source-backed claim")}{item.predicate ? ` · ${String(item.predicate)}` : ""}</p>
          {item.value !== undefined && item.value !== null ? <p className="mt-1 text-muted-foreground">{String(item.value)}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">Revision {String(item.source_revision_id ?? "not supplied")} · anchors {item.source_anchor_ids?.map(String).join(", ") || "not supplied"}</p>
        </li>
      ))}</ul> : <p className="mt-2 text-sm text-muted-foreground">No evidence was returned in this category.</p>}
    </section>
  );
}

function SourceList({ items }: { items: MissionSource[] }) {
  return (
    <section className="rounded-xl border p-5">
      <h3 className="font-semibold">Retrieved canonical sources ({items.length})</h3>
      {items.length ? <ul className="mt-3 space-y-3">{items.map((item, index) => (
        <li className="rounded-lg bg-muted p-3 text-sm" key={item.result_id ?? `source-${index}`}>
          <p className="font-medium">{item.title || item.object_type || "Canonical source"}</p>
          {item.authorized_excerpt ? <blockquote className="mt-2 border-l-2 pl-3 text-muted-foreground">{item.authorized_excerpt}</blockquote> : null}
          <p className="mt-2 text-xs text-muted-foreground">Revision {String(item.citation?.revision_id ?? "not supplied")} · anchors {item.citation?.source_anchor_ids?.map(String).join(", ") || "not supplied"}</p>
        </li>
      ))}</ul> : <p className="mt-2 text-sm text-muted-foreground">No display-authorized canonical sources were returned.</p>}
    </section>
  );
}

function MissionResult({ mission }: { mission: BrainMission }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Mission state</p><h3 className="text-lg font-semibold">{mission.state.replaceAll("_", " ")}</h3></div><p className="text-sm text-muted-foreground">Stage: {mission.current_stage.replaceAll("_", " ")}</p></div>
      {/* The Brain's bounded synthesis, ahead of the evidence it interprets.
          Conclusions are rendered as synthesis, never as another evidence row. */}
      <ScientificSynthesis mission={mission} />
      <SourceList items={mission.sources} />
      <div className="grid gap-4 md:grid-cols-2"><EvidenceList title="Supporting evidence" items={mission.supporting_evidence} /><EvidenceList title="Contradicting evidence" items={mission.contradicting_evidence} /></div>
      <section className="rounded-xl border p-5"><h3 className="font-semibold">Evidence gaps</h3>{mission.missing_evidence.length ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{mission.missing_evidence.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No additional gaps were reported.</p>}</section>
      <section className="rounded-xl border p-5"><h3 className="font-semibold">Governance</h3><p className="mt-2 text-sm">Review: {mission.review_status.replaceAll("_", " ")}</p><p className="text-sm">Automatic publication: never</p><p className="text-sm">Publication eligible: {mission.publication_eligibility.eligible ? "yes" : "no"}</p></section>
    </div>
  );
}

function CitationList({ items }: { items: CalyxCitation[] }) {
  if (!items.length) return null;
  return (
    <details className="mt-2 rounded-xl border bg-background px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Sources surfaced for this turn · {items.length}</summary>
      <ol className="mt-3 space-y-3 text-xs text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${item.doi ?? item.pmid ?? item.title}-${index}`}>
            <p className="font-medium text-foreground">{item.title}</p>
            <p>{[item.authors, item.publication_date, item.journal].filter(Boolean).join(" · ")}</p>
            <p>{[item.doi ? `DOI ${item.doi}` : null, item.pmid ? `PMID ${item.pmid}` : null, item.pmcid ? `PMCID ${item.pmcid}` : null].filter(Boolean).join(" · ") || "Persistent identifier not supplied"}</p>
            <p>{item.canonical_evidence ? "Canonical Continuum evidence" : (item.review_state ?? "REVIEW_REQUIRED").replaceAll("_", " ")}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}

const COVERAGE_STYLE: Record<string, string> = {
  supported: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  contested: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  contradicted: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  unresolved: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const COVERAGE_LABEL: Record<string, string> = {
  supported: "Supported",
  contested: "Evidence disagrees",
  contradicted: "Contradicted",
  unresolved: "No linked evidence",
};

/**
 * Secondary, inspectable surface for one answer.
 *
 * The primary surface stays the natural synthesized answer. Everything the
 * conversational reply deliberately does not narrate — which part of the
 * question each piece of evidence bore on, where evidence disagreed, what is
 * still missing, and the governed provenance — lives here behind progressive
 * disclosure so the answer never reads as a source inventory.
 */
function SynthesisDetail({ structure }: { structure: CalyxSynthesisStructure }) {
  const claims = (structure.claim_coverage ?? []).filter((item) => item.claim?.trim());
  const gaps = structure.missing_evidence ?? [];
  const provenance = structure.governed_provenance ?? {};
  const hasProvenance = Boolean(
    provenance.mission_id || provenance.evidence_packet_id || provenance.interpretation_id,
  );
  if (!claims.length && !gaps.length && !hasProvenance && !structure.degraded_composition) return null;

  return (
    <details className="mt-2 rounded-xl border bg-background px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        How this answer was reached
        {structure.unresolved_conflict ? " · evidence disagrees" : ""}
      </summary>

      {structure.degraded_composition ? (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-5">
          Composed directly from linked evidence — the generative reasoning path was not
          available for this reply. The evidence and its limits are accurate; the explanation
          is thinner than it would otherwise be.
        </p>
      ) : null}

      {structure.follow_up_turn && structure.resolved_subject ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Continuing: <span className="text-foreground">{structure.resolved_subject}</span>
        </p>
      ) : null}

      {claims.length ? (
        <ul className="mt-3 space-y-2">
          {claims.map((claim) => (
            <li className="rounded-lg border px-3 py-2" key={claim.claim_id}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${COVERAGE_STYLE[claim.coverage] ?? COVERAGE_STYLE.unresolved}`}
                >
                  {COVERAGE_LABEL[claim.coverage] ?? claim.coverage}
                </span>
                <span className="min-w-0 text-xs leading-5 text-foreground">{claim.claim}</span>
              </div>
              {claim.source_families.length > 1 ? (
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Combined across {claim.source_families.length} kinds of evidence:{" "}
                  {claim.source_families.map((family) => family.replace(/_/g, " ")).join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {gaps.length ? (
        <div className="mt-3">
          <p className="text-xs font-medium">Still missing</p>
          <ul className="mt-1 list-disc pl-5 text-xs leading-5 text-muted-foreground">
            {gaps.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}
          </ul>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Missing evidence, not evidence of absence.
          </p>
        </div>
      ) : null}

      {hasProvenance ? (
        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
          Provenance:{" "}
          {[
            provenance.mission_id ? `mission ${provenance.mission_id}` : null,
            provenance.evidence_packet_id ? `evidence packet ${provenance.evidence_packet_id}` : null,
            provenance.interpretation_id ? `interpretation ${provenance.interpretation_id}` : null,
            provenance.review_status ? String(provenance.review_status).replace(/_/g, " ") : null,
          ].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </details>
  );
}

function CalyxArtifactView({ artifact }: { artifact: CalyxArtifact }) {
  if (artifact.kind === "chart") {
    const config = { value: { label: artifact.yLabel ?? "Value", color: "hsl(var(--primary))" } };
    return (
      <figure className="mt-4 rounded-xl border bg-background p-4">
        <figcaption className="mb-3 font-medium">{artifact.title}</figcaption>
        <ChartContainer className="h-64 w-full" config={config}>
          {artifact.chartType === "line" ? (
            <LineChart data={artifact.points}>
              <CartesianGrid vertical={false} />
              <XAxis axisLine={false} dataKey="label" minTickGap={24} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="value" dot={false} stroke="var(--color-value)" strokeWidth={2} type="monotone" />
            </LineChart>
          ) : (
            <BarChart data={artifact.points}>
              <CartesianGrid vertical={false} />
              <XAxis axisLine={false} dataKey="label" minTickGap={24} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ChartContainer>
        {artifact.xLabel || artifact.yLabel ? <p className="mt-2 text-xs text-muted-foreground">{artifact.xLabel ? `X: ${artifact.xLabel}` : ""}{artifact.xLabel && artifact.yLabel ? " · " : ""}{artifact.yLabel ? `Y: ${artifact.yLabel}` : ""}</p> : null}
      </figure>
    );
  }

  if (artifact.kind === "map") {
    return (
      <figure className="mt-4 rounded-xl border bg-background p-4">
        <figcaption className="mb-1 font-medium">{artifact.title}</figcaption>
        <p className="mb-3 text-xs text-muted-foreground">Latitude/longitude occurrence plot. This is a geographic data view, not a basemap.</p>
        <ChartContainer className="h-64 w-full" config={{ point: { label: "Occurrence", color: "hsl(var(--primary))" } }}>
          <ScatterChart>
            <CartesianGrid />
            <XAxis dataKey="lon" domain={[-180, 180]} name="Longitude" type="number" unit="°" />
            <YAxis dataKey="lat" domain={[-90, 90]} name="Latitude" type="number" unit="°" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Scatter data={artifact.points} fill="var(--color-point)" name="Occurrence" />
          </ScatterChart>
        </ChartContainer>
      </figure>
    );
  }

  return (
    <figure className="mt-4 rounded-xl border bg-background p-4">
      {artifact.title ? <figcaption className="mb-3 font-medium">{artifact.title}</figcaption> : null}
      <img alt={artifact.alt ?? artifact.title ?? "Calyx sourced media"} className="max-h-[32rem] w-full rounded-lg object-contain" loading="lazy" referrerPolicy="no-referrer" src={artifact.url} />
      {artifact.caption || artifact.source ? <p className="mt-2 text-xs text-muted-foreground">{artifact.caption}{artifact.caption && artifact.source ? " · " : ""}{artifact.source ? `Source: ${artifact.source}` : ""}</p> : null}
    </figure>
  );
}

function CalyxMessageContent({ content }: { content: string }) {
  const parsed = useMemo(() => parseCalyxArtifacts(content), [content]);
  return (
    <div>
      {parsed.prose ? <div className="calyx-prose text-sm leading-6" dangerouslySetInnerHTML={{ __html: renderCalyxRichText(parsed.prose) }} /> : null}
      {parsed.artifacts.map((artifact, index) => <CalyxArtifactView artifact={artifact} key={`${artifact.kind}-${index}`} />)}
    </div>
  );
}

export default function CalyxWorkspace() {
  const [snapshot, setSnapshot] = useState<CalyxWorkspaceSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [conversation, setConversation] = useState<CalyxConversation | null>(null);
  const [missions, setMissions] = useState<Record<string, BrainMission>>({});
  const [submitting, setSubmitting] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedAttachmentIndex, setSelectedAttachmentIndex] = useState<number | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);
  const [fileTextContent, setFileTextContent] = useState<string | null>(null);
  const [documentContext, setDocumentContext] = useState("");
  const [selectedDocumentText, setSelectedDocumentText] = useState("");
  const [conversations, setConversations] = useState<Array<{ conversation_id: string; title?: string | null; created_at: string; message_count?: number }>>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [autoRetryCountdown, setAutoRetryCountdown] = useState<number | null>(null);

  const submitElapsedSeconds = useElapsedSeconds(submitting);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const submissionLockRef = useRef<number | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const activeProjectIdRef = useRef(DEFAULT_PROJECT_ID);
  const missionLookupAttemptsRef = useRef<Set<string>>(new Set());
  const retryMessageRef = useRef<string | null>(null);

  const { speak, cancel: cancelSpeech, supported: ttsSupported } = useCalyxSpeechOutput();
  const { state: micState, interimTranscript, error: speechInputError, startListening, stopListening } = useCalyxSpeechInput(
    useCallback((transcript: string) => {
      setMessage((current) => (current ? `${current} ${transcript}`.trim() : transcript));
    }, []),
  );

  const normalizedProjectId = normalizeProjectId(projectId);
  const projectMismatch = Boolean(conversation && !shouldReuseConversation(conversation, normalizedProjectId));
  const messages = conversation ? visibleConversationMessages(conversation.messages) : [];
  const latestMission = useMemo(() => {
    const calyxMessages = conversation?.messages.filter((item) => item.role === "calyx") ?? [];
    for (let index = calyxMessages.length - 1; index >= 0; index -= 1) {
      const mission = missions[calyxMessages[index].message_id];
      if (mission) return mission;
    }
    return null;
  }, [conversation?.messages, missions]);
  const selectedAttachment = selectedAttachmentIndex === null ? null : uploadedFiles[selectedAttachmentIndex] ?? null;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const structuredPreview = useMemo(
    () => selectedAttachment && fileTextContent ? buildStructuredWorkspacePreview(selectedAttachment.name, fileTextContent) : null,
    [fileTextContent, selectedAttachment],
  );

  useEffect(() => { activeProjectIdRef.current = normalizedProjectId; }, [normalizedProjectId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelSpeech();
      stopListening();
    };
  }, [cancelSpeech, stopListening]);

  useEffect(() => {
    if (!loading) messageInputRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    let active = true;
    const restoreRequestId = requestIdRef.current;
    const restore = async () => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as { conversationId?: string; projectId?: string; speakReplies?: boolean };
        if (stored.projectId) setProjectId(stored.projectId);
        if (typeof stored.speakReplies === "boolean") setSpeakReplies(stored.speakReplies);
        if (stored.conversationId) {
          const restored = await getCalyxConversation(stored.conversationId);
          if (active && mountedRef.current && requestIdRef.current === restoreRequestId && (!stored.projectId || shouldReuseConversation(restored, stored.projectId))) {
            setConversation(restored);
            conversationIdRef.current = restored.conversation_id;
            if (!stored.projectId && restored.project_id) setProjectId(restored.project_id);
          } else if (active && mountedRef.current && requestIdRef.current === restoreRequestId && stored.projectId) {
            setWorkspaceStatus(`A saved CALYX thread for another project was skipped so project ${normalizeProjectId(stored.projectId)} stays clean.`);
          }
        }
      } catch {
        if (active && mountedRef.current && requestIdRef.current === restoreRequestId) window.localStorage.removeItem(STORAGE_KEY);
      }
      try {
        const value = await loadCalyxWorkspace();
        if (active && mountedRef.current) setSnapshot(value);
      } finally {
        if (active && mountedRef.current) setLoading(false);
      }
    };
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversationId: conversation?.conversation_id, projectId: normalizedProjectId, speakReplies }));
  }, [conversation?.conversation_id, normalizedProjectId, speakReplies]);

  useEffect(() => {
    if (!conversation) return;
    const recentCalyxMessages = conversation.messages.filter((item) => item.role === "calyx").slice(-MAX_HISTORICAL_MISSION_LOOKUPS);
    for (const item of recentCalyxMessages) {
      if (missions[item.message_id]) continue;
      const missionId = typeof item.metadata?.mission_id === "string" ? item.metadata.mission_id : null;
      if (!missionId || missionLookupAttemptsRef.current.has(missionId)) continue;
      missionLookupAttemptsRef.current.add(missionId);
      void getBrainMission(missionId)
        .then((mission) => {
          if (!mountedRef.current) return;
          setMissions((current) => ({ ...current, [item.message_id]: mission }));
        })
        .catch(() => undefined);
    }
  }, [conversation, missions]);

  useEffect(() => { scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversation?.messages, submitting, workspaceStatus]);

  useEffect(() => {
    if (!selectedAttachment) { setPreviewUrl(null); return; }
    if (!(selectedAttachment.type === "application/pdf" || selectedAttachment.type.startsWith("image/"))) { setPreviewUrl(null); return; }
    const objectUrl = URL.createObjectURL(selectedAttachment);
    setPreviewUrl(objectUrl);
    return () => { URL.revokeObjectURL(objectUrl); };
  }, [selectedAttachment]);

  useEffect(() => {
    setFileTextContent(null);
    setSelectedDocumentText("");
    setDocumentContext("");
    if (!selectedAttachment || !isCalyxTextWorkspaceFile(selectedAttachment)) return;
    let cancelled = false;
    const previewBlob = selectedAttachment.slice(0, MAX_TEXT_WORKSPACE_PREVIEW_BYTES);
    previewBlob.text().then((content) => {
      if (!cancelled) {
        const truncated = selectedAttachment.size > MAX_TEXT_WORKSPACE_PREVIEW_BYTES;
        setFileTextContent(truncated ? `${content}\n\n[Preview truncated at ${formatUploadedFileSize(MAX_TEXT_WORKSPACE_PREVIEW_BYTES)}.]` : content);
      }
    }).catch(() => { if (!cancelled) setFileTextContent(null); });
    return () => { cancelled = true; };
  }, [selectedAttachment]);

  const refreshConversationHistory = useCallback(async () => {
    try {
      const result = await listCalyxConversations(15);
      if (!mountedRef.current) return;
      setConversations(result.conversations);
      setHistoryError(null);
    } catch (error) {
      if (!mountedRef.current) return;
      setHistoryError(error instanceof CalyxApiError && error.kind === "authentication_required" ? "Sign in at Mission Control to load conversation history." : "Conversation history unavailable.");
    }
  }, []);

  useEffect(() => { void refreshConversationHistory(); }, [refreshConversationHistory]);

  function isActiveLifecycleRequest(requestId: number, targetProjectId: string) {
    return mountedRef.current && requestIdRef.current === requestId && activeProjectIdRef.current === targetProjectId;
  }

  const ensureConversation = useCallback(async (activeProjectId: string, requestId: number): Promise<CalyxConversation | null> => {
    if (shouldReuseConversation(conversation, activeProjectId)) return conversation as CalyxConversation;
    const created = await createCalyxConversation({
      title: "Speak with Calyx",
      project_id: activeProjectId,
      context: buildCalyxTurnContext({ projectId: activeProjectId, uploadedFiles, selectedAttachment, selectedDocumentText, documentContext, fileTextContent }),
    });
    if (!isActiveLifecycleRequest(requestId, activeProjectId)) return null;
    if (conversation && !shouldReuseConversation(conversation, activeProjectId)) {
      setMissions({});
      missionLookupAttemptsRef.current.clear();
      setWorkspaceStatus(`Started a clean CALYX thread for project ${activeProjectId}.`);
    } else setWorkspaceStatus(null);
    setConversation(created);
    conversationIdRef.current = created.conversation_id;
    return created;
  }, [conversation, documentContext, fileTextContent, selectedAttachment, selectedDocumentText, uploadedFiles]);

  function isCurrentRequest(requestId: number, targetConversationId: string | null, targetProjectId: string) {
    return mountedRef.current && requestIdRef.current === requestId && conversationIdRef.current === targetConversationId && activeProjectIdRef.current === targetProjectId;
  }

  const cancelAutoRetry = useCallback(() => {
    retryMessageRef.current = null;
    setAutoRetryCountdown(null);
  }, []);

  const sendMessage = useCallback(async (overrideMessage?: string) => {
    const text = (overrideMessage ?? message).trim();
    if (!text || submissionLockRef.current !== null) return;
    cancelAutoRetry();
    const activeProjectId = normalizeProjectId(projectId);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    submissionLockRef.current = requestId;
    setSubmitting(true);
    setConversationError(null);
    setAuthRequired(false);
    setWorkspaceStatus(null);
    if (!overrideMessage) setMessage("");
    cancelSpeech();
    stopListening();
    let targetConversationId: string | null = null;
    let turnCommitted = false;
    try {
      const thread = await ensureConversation(activeProjectId, requestId);
      if (!thread) return;
      targetConversationId = thread.conversation_id;
      const result = await sendCalyxTurn(thread.conversation_id, {
        message: text,
        project_id: activeProjectId,
        context: buildCalyxTurnContext({ projectId: activeProjectId, uploadedFiles, selectedAttachment, selectedDocumentText, documentContext, fileTextContent }),
        research_mode: "auto",
        retrieval_limit: 20,
      });
      turnCommitted = true;
      if (!isCurrentRequest(requestId, targetConversationId, activeProjectId)) return;
      if (result.research.mission) setMissions((current) => ({ ...current, [result.calyx_message.message_id]: result.research.mission as BrainMission }));
      const refreshed = await getCalyxConversation(thread.conversation_id);
      if (!isCurrentRequest(requestId, targetConversationId, activeProjectId)) return;
      setConversation(refreshed);
      conversationIdRef.current = refreshed.conversation_id;
      void refreshConversationHistory();
      if (speakReplies && result.answer) speak(result.answer);
    } catch (error) {
      if (!isActiveLifecycleRequest(requestId, activeProjectId)) return;
      if (turnCommitted) {
        setAuthRequired(false);
        setConversationError("CALYX completed the turn, but the conversation could not be refreshed. Reload the thread before retrying so the same turn is not sent twice.");
        void refreshConversationHistory();
        return;
      }
      const isNetwork = error instanceof CalyxApiError && error.kind === "network_error";
      const isAuth = error instanceof CalyxApiError && error.kind === "authentication_required";
      const detail = error instanceof CalyxApiError ? (isNetwork ? `${error.message} — the CALYX backend may be waking up; your message has been restored so you can retry.` : error.message) : "Calyx could not complete that turn.";
      setAuthRequired(isAuth);
      setConversationError(detail);
      setMessage(text);
      if (isNetwork) {
        retryMessageRef.current = text;
        setAutoRetryCountdown(NETWORK_RETRY_SECONDS);
      }
    } finally {
      if (submissionLockRef.current === requestId) submissionLockRef.current = null;
      if (mountedRef.current && requestIdRef.current === requestId) setSubmitting(false);
    }
  }, [
    cancelAutoRetry,
    cancelSpeech,
    ensureConversation,
    documentContext,
    fileTextContent,
    message,
    projectId,
    refreshConversationHistory,
    selectedAttachment,
    selectedDocumentText,
    speak,
    speakReplies,
    stopListening,
    uploadedFiles,
  ]);

  useEffect(() => {
    if (autoRetryCountdown === null || submitting) return;
    if (autoRetryCountdown <= 0) {
      const retryMessage = retryMessageRef.current;
      cancelAutoRetry();
      if (retryMessage) void sendMessage(retryMessage);
      return;
    }
    const timeout = window.setTimeout(() => {
      setAutoRetryCountdown((current) => (current === null ? null : current - 1));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [autoRetryCountdown, cancelAutoRetry, sendMessage, submitting]);

  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await sendMessage(); }

  function newConversation() {
    requestIdRef.current += 1;
    cancelAutoRetry();
    cancelSpeech();
    stopListening();
    conversationIdRef.current = null;
    setConversation(null);
    setMissions({});
    missionLookupAttemptsRef.current.clear();
    setMessage("");
    setConversationError(null);
    setAuthRequired(false);
    setWorkspaceStatus(null);
    setSubmitting(false);
    submissionLockRef.current = null;
    setUploadedFiles([]);
    setSelectedAttachmentIndex(null);
    setFileTextContent(null);
    setDocumentContext("");
    setSelectedDocumentText("");
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void sendMessage(); }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) {
      setUploadedFiles((current) => {
        const next = [...current, ...files];
        if (selectedAttachmentIndex === null) setSelectedAttachmentIndex(current.length);
        return next;
      });
      setWorkspaceStatus("Files are attached locally. Canonical backend still needs a CALYX file upload and paper retrieval contract for authenticated ingestion.");
    }
    event.target.value = "";
  }

  function removeFile(index: number) {
    setUploadedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setSelectedAttachmentIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  async function loadConversation(conversationId: string) {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    cancelAutoRetry();
    cancelSpeech();
    stopListening();
    conversationIdRef.current = null;
    setConversation(null);
    setMissions({});
    missionLookupAttemptsRef.current.clear();
    setMessage("");
    setConversationError(null);
    setAuthRequired(false);
    setWorkspaceStatus("Loading conversation…");
    setSubmitting(false);
    submissionLockRef.current = null;
    try {
      const loaded = await getCalyxConversation(conversationId);
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      setConversation(loaded);
      conversationIdRef.current = loaded.conversation_id;
      if (loaded.project_id) setProjectId(loaded.project_id);
      setWorkspaceStatus(null);
    } catch (error) {
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      setWorkspaceStatus(error instanceof CalyxApiError && error.kind === "authentication_required" ? "Sign in at Mission Control to load that conversation." : "Could not load that conversation.");
    }
  }

  function exportConversation() {
    if (!conversation) return;
    const blob = new Blob([buildCalyxConversationExport(conversation)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `calyx-research-${conversation.conversation_id.slice(0, 8)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function addDocumentContext(text: string, fileName = selectedAttachment?.name ?? "workspace selection") {
    const prompt = buildCalyxDocumentContextPrompt(fileName, text);
    if (!prompt) return;
    setMessage((current) => (current ? `${current}\n\n${prompt}` : prompt));
  }

  function handleViewerMouseUp(_event: MouseEvent<HTMLElement>) { setSelectedDocumentText(window.getSelection()?.toString().trim() ?? ""); }
  function askAboutSelection() {
    if (selectedDocumentText) { addDocumentContext(selectedDocumentText); setSelectedDocumentText(""); return; }
    if (fileTextContent) addDocumentContext(fileTextContent);
  }
  function addPastedDocumentContext() { addDocumentContext(documentContext, selectedAttachment?.name ?? "pasted document excerpt"); setDocumentContext(""); }
  function handleMessageChange(nextValue: string) {
    if (autoRetryCountdown !== null) cancelAutoRetry();
    setMessage(nextValue);
  }
  function applyStarterQuestion(question: string) {
    cancelAutoRetry();
    setMessage(question);
    messageInputRef.current?.focus();
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2"><p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Calyx Workspace</p><h1 className="text-4xl font-semibold">Speak with Calyx</h1><p className="max-w-3xl text-muted-foreground">A server-owned conversation with the Orchid Continuum Brain. Calyx decides when a turn needs governed retrieval or a scientific mission; the browser no longer authors its answers.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {conversation ? <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={exportConversation} type="button">↓ Export research</button> : null}
            <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={newConversation} type="button">New conversation</button>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section className="rounded-xl border bg-card">
            <div className="max-h-[62vh] min-h-80 space-y-5 overflow-y-auto p-5" aria-live="polite">
              {!messages.length ? <div className="mx-auto max-w-2xl py-14 text-center"><h2 className="text-2xl font-semibold">What would you like to work on?</h2><p className="mt-3 text-sm text-muted-foreground">Ask a scientific question, request a literature review, or ask Calyx to prepare chart/map-ready research output.</p><div className="mt-6 grid gap-2 text-left sm:grid-cols-2">{CALYX_STARTER_QUESTIONS.map((question) => <button className="rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted" key={question} onClick={() => applyStarterQuestion(question)} type="button">{question}</button>)}</div></div> : messages.map((turn) => {
                const citations = turn.role === "calyx" && Array.isArray(turn.metadata?.citations) ? turn.metadata.citations as CalyxCitation[] : [];
                return (
                  <article className={`max-w-4xl ${turn.role === "operator" ? "ml-auto" : "mr-auto"}`} key={turn.message_id}>
                    <div className={`rounded-2xl px-4 py-3 ${turn.role === "operator" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {turn.role === "calyx" ? <CalyxMessageContent content={turn.content} /> : <p className="whitespace-pre-wrap text-sm leading-6">{turn.content}</p>}
                    </div>
                    {turn.role === "calyx" && ttsSupported ? <button aria-label="Speak this reply" className="mt-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted" onClick={() => speak(turn.content)} type="button">🔊 Speak</button> : null}
                    {turn.role === "calyx" ? <CitationList items={citations} /> : null}
                    {turn.role === "calyx" && turn.metadata?.synthesis_structure ? (
                      <SynthesisDetail structure={turn.metadata.synthesis_structure as CalyxSynthesisStructure} />
                    ) : null}
                    {turn.role === "calyx" && missions[turn.message_id] ? <details className="mt-2 rounded-xl border bg-background px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Research details · mission {missions[turn.message_id].mission_id}</summary><MissionResult mission={missions[turn.message_id]} /></details> : null}
                    {turn.role === "calyx" && turn.metadata?.provider ? <p className="mt-1 text-xs text-muted-foreground">Server reply · {String(turn.metadata.provider)} · {String(turn.metadata.model ?? "model not reported")}</p> : null}
                  </article>
                );
              })}
              {submitting ? <div className="mr-auto rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Calyx is working…{submitElapsedSeconds >= 5 ? ` (${submitElapsedSeconds}s${submitElapsedSeconds >= 20 ? " — deep research may take longer" : ""})` : ""}</div> : null}
              <div ref={scrollAnchorRef} />
            </div>
            <form className="border-t p-4" onSubmit={submit}>
              {interimTranscript ? <p className="mb-2 text-xs italic text-muted-foreground">{interimTranscript}…</p> : null}
              <label className="sr-only" htmlFor="calyx-message">Message Calyx</label>
              <textarea className="min-h-24 w-full resize-y rounded-xl border bg-background px-4 py-3" id="calyx-message" maxLength={MAX_CALYX_MESSAGE_CHARS} onChange={(event) => handleMessageChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="Message Calyx… (Ctrl+Enter to send)" ref={messageInputRef} value={message} />
              <div className="mt-1 flex flex-wrap justify-between gap-2"><p className="text-xs text-muted-foreground">No word-count cap; the backend uses model token budgets and preserves long research prompts.</p><p className={`text-xs ${message.length >= MAX_CALYX_MESSAGE_CHARS * 0.9 ? "text-amber-600" : "text-muted-foreground"}`}>{message.length.toLocaleString()} / {MAX_CALYX_MESSAGE_CHARS.toLocaleString()} characters</p></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Conversation settings</summary>
                    <label className="mt-2 block font-medium" htmlFor="calyx-project">Research project ID</label>
                    <input className="mt-1 w-72 max-w-full rounded-md border bg-background px-3 py-2 text-foreground" disabled={submitting} id="calyx-project" maxLength={200} onChange={(event) => setProjectId(event.target.value)} value={projectId} />
                  </details>
                  {micState !== "unsupported" ? <button aria-label={micState === "listening" ? "Stop voice input" : "Start voice input"} className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${micState === "listening" ? "border-destructive bg-destructive/10 text-destructive" : "hover:bg-muted"}`} disabled={submitting && micState !== "listening"} onClick={micState === "listening" ? stopListening : startListening} type="button">{micState === "listening" ? "⏹ Stop" : "🎤 Voice"}</button> : <span className="text-xs text-muted-foreground">Voice input unavailable in this browser.</span>}
                  <button className="rounded-full border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50" disabled={submitting} onClick={() => fileInputRef.current?.click()} type="button">📎 Attach</button>
                  <input accept="application/pdf,image/*,.csv,.tsv,.txt,.md,.json" aria-hidden className="sr-only" multiple onChange={handleFileChange} ref={fileInputRef} tabIndex={-1} type="file" />
                  {ttsSupported ? <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input checked={speakReplies} className="h-3 w-3" onChange={(event) => { setSpeakReplies(event.target.checked); if (!event.target.checked) cancelSpeech(); }} type="checkbox" />Speak replies</label> : <span className="text-xs text-muted-foreground">Spoken replies unavailable in this browser.</span>}
                </div>
                <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={submitting || !message.trim()} type="submit">{submitting ? "Working…" : projectMismatch ? "Start new project thread" : "Send"}</button>
              </div>
              {projectMismatch ? <p className="mt-3 text-xs text-muted-foreground">The visible thread belongs to project <strong>{normalizeProjectId(conversation?.project_id)}</strong>. Sending now starts a clean CALYX thread for <strong>{normalizedProjectId}</strong>.</p> : null}
              {speechInputError ? <p className="mt-3 text-sm text-destructive" role="alert">{speechInputError}</p> : null}
              {conversationError ? <p className="mt-3 text-sm text-destructive" role="alert">{conversationError}{authRequired ? <> · <Link className="underline" to="/mission-control">Sign in at Mission Control</Link></> : null}</p> : null}
              {autoRetryCountdown !== null ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Retrying this turn in {autoRetryCountdown}s.</span><button className="rounded border px-2 py-1 hover:bg-muted" onClick={() => { const retryMessage = retryMessageRef.current; cancelAutoRetry(); if (retryMessage) void sendMessage(retryMessage); }} type="button">Retry now</button><button className="rounded border px-2 py-1 hover:bg-muted" onClick={cancelAutoRetry} type="button">Cancel</button></div> : null}
            </form>
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Scientific workspace</p>
              <h2 className="mt-2 text-2xl font-semibold">Conversation context</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Project</dt><dd className="text-right font-medium">{normalizedProjectId}</dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Conversation</dt><dd className="text-right font-medium">{conversation?.conversation_id ?? "Not started yet"}</dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Persistence</dt><dd className="text-right font-medium">{conversation?.persistence_mode ?? "Will be created on first turn"}</dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Latest mission</dt><dd className="text-right font-medium">{latestMission ? latestMission.current_stage.replaceAll("_", " ") : "No research mission yet"}</dd></div>
              </dl>
              {workspaceStatus ? <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{workspaceStatus}</p> : null}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">History</p><h2 className="mt-2 text-2xl font-semibold">Prior CALYX threads</h2></div><button className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50" disabled={submitting} onClick={() => void refreshConversationHistory()} type="button">Refresh</button></div>
              {historyError ? <p className="mt-4 text-sm text-muted-foreground">{historyError}</p> : null}
              {conversations.length ? <ul className="mt-4 space-y-3">{conversations.map((thread) => <li className="rounded-xl border p-3" key={thread.conversation_id}><button className="w-full text-left disabled:opacity-50" disabled={submitting} onClick={() => void loadConversation(thread.conversation_id)} type="button"><p className="font-medium">{thread.title || thread.conversation_id}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(thread.created_at).toLocaleString()} · {thread.message_count ?? 0} messages</p></button></li>)}</ul> : !historyError ? <p className="mt-4 text-sm text-muted-foreground">No prior CALYX threads surfaced by the backend yet.</p> : null}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Papers and files</p><h2 className="mt-2 text-2xl font-semibold">Local workspace</h2></div><span className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">{uploadedFiles.length} file{uploadedFiles.length === 1 ? "" : "s"}</span></div>
              {uploadedFiles.length ? <ul className="mt-4 space-y-3">{uploadedFiles.map((file, index) => <li className={`rounded-xl border p-3 ${selectedAttachmentIndex === index ? "border-primary bg-primary/5" : ""}`} key={`${file.name}-${file.size}-${index}`}><div className="flex items-start justify-between gap-3"><button className="min-w-0 flex-1 text-left disabled:opacity-50" disabled={submitting} onClick={() => setSelectedAttachmentIndex(index)} type="button"><p className="truncate font-medium">{file.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatUploadedFileSize(file.size)} · {file.type || "Unknown type"}</p></button><button className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={submitting} onClick={() => removeFile(index)} type="button">Remove</button></div></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">Attach a PDF, image, or dataset file to keep it visible beside the conversation tonight. Server-side ingestion is blocked until the canonical file contract exists.</p>}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Preview</p><h2 className="mt-2 text-2xl font-semibold">Scientific viewer</h2></div>{fileTextContent ? <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50" disabled={!fileTextContent} onClick={askAboutSelection} type="button">{selectedDocumentText ? "Ask CALYX about selection" : "Ask CALYX about visible text"}</button> : null}</div>
              {!selectedAttachment ? <p className="mt-4 text-sm text-muted-foreground">Select an attached paper or image to keep it visible while you talk to CALYX.</p> : previewUrl && selectedAttachment.type === "application/pdf" ? <iframe className="mt-4 h-[28rem] w-full rounded-lg border bg-background" src={previewUrl} title={selectedAttachment.name} /> : previewUrl && selectedAttachment.type.startsWith("image/") ? <img alt={selectedAttachment.name} className="mt-4 max-h-[28rem] w-full rounded-lg border object-contain" src={previewUrl} /> : fileTextContent ? <div className="mt-4 space-y-3">{structuredPreview ? <div className="space-y-4 rounded-lg border bg-background p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Structured data preview</p><p className="text-xs text-muted-foreground">{structuredPreview.summary}</p></div><div className="overflow-auto rounded-md border"><table className="min-w-full text-left text-xs"><thead className="bg-muted/60"><tr>{structuredPreview.columns.map((column) => <th className="px-3 py-2 font-medium" key={column}>{column}</th>)}</tr></thead><tbody>{structuredPreview.rows.map((row, rowIndex) => <tr className="border-t align-top" key={`structured-row-${rowIndex}`}>{structuredPreview.columns.map((column) => <td className="px-3 py-2 text-muted-foreground" key={`${column}-${rowIndex}`}>{row[column] === null ? "—" : String(row[column])}</td>)}</tr>)}</tbody></table></div>{structuredPreview.chart ? <ChartContainer className="h-56 w-full" config={{ value: { label: structuredPreview.chart.valueKey, color: "hsl(var(--primary))" } }}><BarChart accessibilityLayer data={structuredPreview.chart.points}><CartesianGrid vertical={false} /><XAxis axisLine={false} dataKey="label" minTickGap={24} tickLine={false} /><ChartTooltip content={<ChartTooltipContent hideLabel />} /><Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} /></BarChart></ChartContainer> : null}</div> : null}<pre className="max-h-[28rem] overflow-auto rounded-lg border bg-background p-4 text-xs leading-6" onMouseUp={handleViewerMouseUp}>{fileTextContent}</pre><textarea className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm" onChange={(event) => setDocumentContext(event.target.value)} placeholder="Paste a paper excerpt or dataset rows to ground the next CALYX turn." value={documentContext} /><div className="flex justify-end"><button className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50" disabled={!documentContext.trim()} onClick={addPastedDocumentContext} type="button">Add excerpt to message</button></div></div> : <p className="mt-4 text-sm text-muted-foreground">Preview is available tonight for PDFs, images, and text-oriented research files. Backend upload and canonical rendering remain blocked until the CALYX file contract is deployed.</p>}
              {selectedDocumentText ? <p className="mt-3 text-xs text-muted-foreground">Selected text is ready to append to the next message.</p> : null}
            </section>
          </aside>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading Calyx systems…</p> : null}
        {snapshot.errors.length ? <section className="rounded-xl border p-4"><h2 className="font-semibold">Degraded connections</h2><ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{snapshot.errors.map((error) => <li key={error}>{error}</li>)}</ul></section> : null}
        <section className="grid gap-4 md:grid-cols-3"><article className="rounded-xl border p-5"><h2 className="font-semibold">Platform capabilities</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.capabilities ? "Canonical capability contract available." : "Capability service unavailable."}</p></article><article className="rounded-xl border p-5"><h2 className="font-semibold">Conversation persistence</h2><p className="mt-2 text-sm text-muted-foreground">{conversation?.persistence_mode ? `${conversation.persistence_mode} conversation state reported by the backend.` : "A server thread will be created when you send the first message."}</p></article><article className="rounded-xl border p-5"><h2 className="font-semibold">Durable orchestrator</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.orchestratorState === "available" ? "Authenticated orchestrator status available." : snapshot.orchestratorState === "authentication_required" ? <><Link className="underline" to="/mission-control">Sign in at Mission Control</Link> to enable the durable orchestrator.</> : "Orchestrator status unavailable."}</p></article></section>
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><Link className="rounded-xl border p-5 hover:bg-muted" to="/relationship-matrix"><h2 className="font-semibold">Relationship Matrix</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/orchid-identification"><h2 className="font-semibold">Orchid Identification</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/continuum-next"><h2 className="font-semibold">Homepage Intelligence</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/university"><h2 className="font-semibold">Orchid University</h2></Link></section>
        <section className="rounded-xl border p-5"><h2 className="font-semibold">Governance</h2><p className="mt-2 text-sm text-muted-foreground">Conversation can retrieve and reason, but does not automatically publish scientific knowledge, promote Candidate Knowledge, change taxonomy, or mutate the Knowledge Graph.</p></section>
      </div>
    </main>
  );
}