import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, Lock, MessageSquareWarning, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvidenceObjectType, FeedbackCaseStatus } from "@/lib/evidenceFeedback";
import {
  DECISION_LABELS,
  REVIEW_OBJECT_TYPE_FILTERS,
  REVIEW_STATUS_FILTERS,
  createEvidenceFeedbackReviewClient,
  reviewAccessState,
  reviewErrorMessage,
  statusLabel,
  type EvidenceFeedbackReviewClient,
  type ReviewAccessState,
  type ReviewCase,
  type ReviewCaseDetail,
  type ReviewDecision,
  type ReviewDecisionInput,
  type ReviewDecisionResult,
  type ReviewQueueItem,
} from "@/lib/evidenceFeedbackReview";

/**
 * Feedback review — the owner's queue for corrections submitted from records
 * (Release 1 journey 12). The owner reads each case with the exact record
 * version the submitter saw and its event history, then records one of the
 * decisions the backend allows for that case.
 *
 * Decisions never publish to the knowledge graph, change taxonomy or apply a
 * scientific correction; the backend's publication boundary is shown with
 * every case. Submitters appear only as opaque references. Owner session only:
 * a member or the service API key is refused by the backend and the page says
 * so plainly.
 */

export interface FeedbackReviewProps {
  /** Test / integration seam. */
  client?: EvidenceFeedbackReviewClient;
}

export const PUBLICATION_BOUNDARY_NOTICE =
  "Review decisions never publish to the knowledge graph, change taxonomy or apply scientific corrections. A decision here records the owner's triage of a submitted case; anything scientific stays with governed review.";

type QueueState = "loading" | "ready" | "error";

const ACCESS_COPY: Record<ReviewAccessState, { title: string; body: string }> = {
  sign_in_required: {
    title: "Owner session required",
    body: "The feedback review queue answers only the owner session. Sign in at Mission Control with the owner access code, then come back and refresh. Nothing was changed.",
  },
  owner_session_required: {
    title: "Owner session required",
    body: "This request reached the backend with the service API key, which cannot review feedback. Sign in at Mission Control with the owner session. Nothing was changed.",
  },
  owner_access_required: {
    title: "Owner only",
    body: "Your member account is signed in, but reviewing submitted feedback is limited to the owner. Nothing was changed.",
  },
  forbidden: {
    title: "Owner only",
    body: "This session is not permitted to review submitted feedback. Nothing was changed.",
  },
  unavailable: {
    title: "Feedback review is not available on this backend",
    body: "The review routes are not deployed on the connected Calyx backend. Nothing was changed.",
  },
  outage: {
    title: "Feedback review is unavailable",
    body: "The review service could not be reached or returned an incomplete response. No queue is shown rather than a partial one. Try again shortly.",
  },
};

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function humanize(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "—";
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "governed_review_required"
      ? "border-amber-600/50 bg-amber-50 text-amber-900"
      : status === "resolved"
        ? "border-stone-400 bg-stone-100 text-stone-800"
        : "border-emerald-700/40 bg-emerald-50 text-emerald-900";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`} data-status={status}>
      {statusLabel(status)}
    </span>
  );
}

function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm ${mono ? "break-all font-mono text-xs" : ""}`}>{children}</dd>
    </div>
  );
}

type DraftState = { decision: ReviewDecision; text: string; confirming: boolean };

function validateCorrectedPayload(text: string, original: Record<string, unknown> | null): { payload: Record<string, unknown> | null; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { payload: null, error: "The corrected payload is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { payload: null, error: "The corrected payload must be a JSON object." };
  }
  if (original && JSON.stringify(parsed) === JSON.stringify(original)) {
    return { payload: null, error: "The corrected payload is identical to the version the submitter saw; change the wording first." };
  }
  return { payload: parsed as Record<string, unknown>, error: null };
}

function DecisionPanel({
  detail,
  busy,
  onDecide,
}: {
  detail: ReviewCaseDetail;
  busy: boolean;
  onDecide: (input: ReviewDecisionInput) => void;
}) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const caseId = detail.case.case_id;
  const originalPayload = detail.object_version?.payload ?? null;

  useEffect(() => {
    setDraft(null);
  }, [caseId, detail.case.status]);

  if (detail.allowed_decisions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="feedback-review-no-decisions">
        No decisions are available for this case ({statusLabel(detail.case.status).toLowerCase()}).
      </p>
    );
  }

  const start = (decision: ReviewDecision) =>
    setDraft({
      decision,
      text: decision === "accept_trivial" ? prettyJson(originalPayload ?? {}) : "",
      confirming: false,
    });

  const payloadCheck = draft?.decision === "accept_trivial" ? validateCorrectedPayload(draft.text, originalPayload) : null;
  const textMissing = draft ? draft.decision !== "accept_trivial" && !draft.text.trim() : true;
  const canReview = Boolean(draft) && !textMissing && !(payloadCheck && payloadCheck.error);

  const confirm = () => {
    if (!draft || !canReview) return;
    if (draft.decision === "reject") onDecide({ decision: "reject", reason: draft.text.trim() });
    else if (draft.decision === "needs_governed_review") onDecide({ decision: "needs_governed_review", note: draft.text.trim() });
    else if (payloadCheck?.payload) onDecide({ decision: "accept_trivial", corrected_payload: payloadCheck.payload });
  };

  return (
    <div className="space-y-3" data-testid="feedback-review-decisions">
      <div className="flex flex-wrap gap-2">
        {detail.allowed_decisions.map((decision) => (
          <Button
            key={decision}
            size="sm"
            variant={decision === "reject" ? "destructive" : decision === "accept_trivial" ? "default" : "outline"}
            disabled={busy}
            aria-pressed={draft?.decision === decision}
            data-testid={`feedback-decision-${decision}`}
            onClick={() => start(decision)}
          >
            {DECISION_LABELS[decision]}
          </Button>
        ))}
      </div>

      {draft ? (
        <div className="rounded-md border p-3" data-testid={`feedback-decision-form-${draft.decision}`}>
          {draft.decision === "reject" ? (
            <>
              <label htmlFor="feedback-decision-reason" className="block text-sm font-semibold">Reason for rejecting (required)</label>
              <p className="text-xs text-muted-foreground">Recorded with the decision; the submitter sees it as the case resolution.</p>
            </>
          ) : draft.decision === "needs_governed_review" ? (
            <>
              <label htmlFor="feedback-decision-note" className="block text-sm font-semibold">Note for governed review (required)</label>
              <p className="text-xs text-muted-foreground">The case stays unresolved and nothing displayed changes until governed review concludes.</p>
            </>
          ) : (
            <>
              <label htmlFor="feedback-decision-payload" className="block text-sm font-semibold">Corrected record payload (JSON, required)</label>
              <p className="text-xs text-muted-foreground">
                Starts from the exact version the submitter saw. Only a lexicon typo or formatting fix can take this path; it records a new
                version and does not publish anything.
              </p>
            </>
          )}
          <textarea
            id={draft.decision === "reject" ? "feedback-decision-reason" : draft.decision === "needs_governed_review" ? "feedback-decision-note" : "feedback-decision-payload"}
            data-testid="feedback-decision-input"
            value={draft.text}
            onChange={(event) => setDraft({ ...draft, text: event.target.value, confirming: false })}
            maxLength={draft.decision === "accept_trivial" ? undefined : 4000}
            rows={draft.decision === "accept_trivial" ? 12 : 3}
            spellCheck={draft.decision !== "accept_trivial"}
            className={`mt-2 w-full rounded-md border bg-background px-2 py-1 text-sm ${draft.decision === "accept_trivial" ? "font-mono text-xs" : ""}`}
            disabled={busy}
          />
          {payloadCheck?.error ? (
            <p role="alert" className="mt-1 text-xs font-medium text-destructive" data-testid="feedback-decision-payload-error">{payloadCheck.error}</p>
          ) : null}

          {!draft.confirming ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={!canReview || busy} data-testid="feedback-decision-review" onClick={() => setDraft({ ...draft, confirming: true })}>
                Review decision
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          ) : (
            <div role="alertdialog" aria-labelledby="feedback-decision-confirm-title" className="mt-3 rounded-md border border-amber-600/50 bg-amber-50 p-3 text-sm text-amber-950" data-testid="feedback-decision-confirm">
              <p id="feedback-decision-confirm-title" className="font-semibold">
                Confirm: {DECISION_LABELS[draft.decision].toLowerCase()} for case {caseId}?
              </p>
              <p className="mt-1">{detail.publication_boundary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} data-testid="feedback-decision-confirm-button" onClick={confirm}>
                  {busy ? "Recording…" : "Confirm decision"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setDraft({ ...draft, confirming: false })}>Back</Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CaseDetail({
  detail,
  busy,
  decisionError,
  decisionResult,
  onDecide,
}: {
  detail: ReviewCaseDetail;
  busy: boolean;
  decisionError: string | null;
  decisionResult: ReviewDecisionResult | null;
  onDecide: (input: ReviewDecisionInput) => void;
}) {
  const item: ReviewCase = detail.case;
  return (
    <div className="space-y-5" data-testid="feedback-review-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="break-all font-mono text-sm font-semibold">{item.case_id}</h2>
        <StatusBadge status={item.status} />
      </div>

      <p role="note" className="rounded-md border-2 border-amber-600/60 bg-amber-50 p-3 text-sm font-medium text-amber-950" data-testid="feedback-review-publication-boundary">
        <ShieldAlert aria-hidden="true" className="mr-1 inline h-4 w-4" /> {detail.publication_boundary}
      </p>

      <section aria-labelledby="feedback-statement-heading">
        <h3 id="feedback-statement-heading" className="text-sm font-semibold">Submitted statement</h3>
        <p className="mt-1 whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-sm" data-testid="feedback-review-statement">{item.statement}</p>
        {item.proposed_replacement ? (
          <>
            <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposed replacement</h4>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm" data-testid="feedback-review-proposed">{item.proposed_replacement}</p>
          </>
        ) : null}
        {item.citation ? (
          <>
            <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Citation offered (unverified)</h4>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.citation}</p>
          </>
        ) : null}
      </section>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Record">{humanize(item.object_type)} · <span className="break-all font-mono text-xs">{item.object_id}</span></Field>
        <Field label="Feedback">{humanize(item.feedback_class)}{item.defect_kind ? ` · ${humanize(item.defect_kind)}` : ""}{item.severity ? ` · ${item.severity}` : ""}</Field>
        <Field label="Triage">{humanize(item.disposition)} · {humanize(item.review_lane)} lane</Field>
        <Field label="Duplicate submissions">{detail.duplicate_count}</Field>
        <Field label="Submitter ref (opaque, not an identity)" mono>{item.submitter_ref ?? "—"}</Field>
        <Field label="Reviewer ref (opaque, not an identity)" mono>{item.reviewer_ref ?? "—"}</Field>
        <Field label="Submitted">{formatTime(item.created_at)}</Field>
        <Field label="Last updated">{formatTime(item.updated_at)}</Field>
        <Field label="Page context" mono>{item.page_context}</Field>
        <Field label="Version the submitter saw" mono>{item.object_version_hash}</Field>
        {item.source_partner_id ? <Field label="Source partner">{item.source_partner_id}</Field> : null}
        {item.resolution ? <Field label="Resolution">{item.resolution}</Field> : null}
      </dl>

      <section aria-labelledby="feedback-version-heading">
        <h3 id="feedback-version-heading" className="text-sm font-semibold">Record version the submitter saw</h3>
        {detail.object_version_available && detail.object_version ? (
          <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs" data-testid="feedback-review-object-version">
            {prettyJson(detail.object_version.payload)}
          </pre>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground" data-testid="feedback-review-object-version-missing">
            That record version is not stored on this backend, so it cannot be shown or corrected here.
          </p>
        )}
        {detail.resulting_object_version ? (
          <>
            <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resulting version <span className="break-all font-mono normal-case">{detail.resulting_object_version.version_hash}</span> (recorded, not published)
            </h4>
            <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs" data-testid="feedback-review-resulting-version">
              {prettyJson(detail.resulting_object_version.payload)}
            </pre>
          </>
        ) : null}
      </section>

      <section aria-labelledby="feedback-events-heading">
        <h3 id="feedback-events-heading" className="text-sm font-semibold">Event history</h3>
        {detail.events.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No events recorded.</p>
        ) : (
          <ol className="mt-1 space-y-2" data-testid="feedback-review-events">
            {detail.events.map((event, index) => (
              <li key={`${event.event}-${event.timestamp ?? ""}-${index}`} className="rounded-md border p-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{humanize(event.event)}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(event.timestamp)}</span>
                </div>
                <p className="break-all font-mono text-[11px] text-muted-foreground">actor ref (opaque) {event.actor_ref ?? "—"}</p>
                {Object.keys(event.details).length ? (
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px]">{prettyJson(event.details)}</pre>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="feedback-decide-heading" className="border-t pt-4">
        <h3 id="feedback-decide-heading" className="text-sm font-semibold">Decision</h3>
        {decisionResult ? (
          <p role="status" className="mt-2 rounded-md border border-emerald-600/40 bg-emerald-50 p-3 text-sm text-emerald-950" data-testid="feedback-review-decision-result">
            {decisionResult.idempotent
              ? `This decision (${DECISION_LABELS[decisionResult.decision].toLowerCase()}) was already recorded; nothing changed.`
              : `Decision recorded: ${DECISION_LABELS[decisionResult.decision].toLowerCase()}. The case is now ${statusLabel(decisionResult.case.status).toLowerCase()}.`}{" "}
            Nothing was published.
          </p>
        ) : null}
        {decisionError ? (
          <p role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="feedback-review-decision-error">
            {decisionError}
          </p>
        ) : null}
        <div className="mt-3">
          <DecisionPanel detail={detail} busy={busy} onDecide={onDecide} />
        </div>
      </section>
    </div>
  );
}

export default function FeedbackReview({ client }: FeedbackReviewProps) {
  const api = useMemo(() => client ?? createEvidenceFeedbackReviewClient(), [client]);

  const [statusFilter, setStatusFilter] = useState<FeedbackCaseStatus | "">("");
  const [objectTypeFilter, setObjectTypeFilter] = useState<EvidenceObjectType | "">("");
  const [queueState, setQueueState] = useState<QueueState>("loading");
  const [access, setAccess] = useState<ReviewAccessState | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionResult, setDecisionResult] = useState<ReviewDecisionResult | null>(null);
  const loadToken = useRef(0);
  const detailRef = useRef<HTMLDivElement>(null);
  // Synchronous in-flight guard: React state updates are not visible to a
  // second click delivered in the same tick, so `deciding` alone would let two
  // rapid confirmations send two decision requests.
  const decisionInFlight = useRef(false);

  const applyAccessError = (error: unknown): boolean => {
    const state = reviewAccessState(error);
    if (state) {
      setAccess(state);
      return true;
    }
    return false;
  };

  const loadQueue = useCallback(async () => {
    const token = ++loadToken.current;
    setQueueState("loading");
    setQueueError(null);
    setMoreError(null);
    setAccess(null);
    try {
      const page = await api.listCases({ status: statusFilter, objectType: objectTypeFilter });
      if (token !== loadToken.current) return;
      setItems(page.items);
      setNextCursor(page.next_cursor);
      setQueueState("ready");
    } catch (error) {
      if (token !== loadToken.current) return;
      setItems([]);
      setNextCursor(null);
      setQueueState("error");
      if (!applyAccessError(error)) setQueueError(reviewErrorMessage(error));
    }
  }, [api, statusFilter, objectTypeFilter]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const token = loadToken.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.listCases({ status: statusFilter, objectType: objectTypeFilter, cursor: nextCursor });
      if (token !== loadToken.current) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.case_id));
        return [...current, ...page.items.filter((item) => !seen.has(item.case_id))];
      });
      setNextCursor(page.next_cursor);
    } catch (error) {
      if (token !== loadToken.current) return;
      // An outage while paging keeps the rows already shown and offers a retry;
      // only an access refusal replaces the whole page.
      const state = reviewAccessState(error);
      if (state && state !== "outage") setAccess(state);
      else setMoreError(reviewErrorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const openCase = async (caseId: string) => {
    setSelectedId(caseId);
    setDetail(null);
    setDetailError(null);
    setDecisionError(null);
    setDecisionResult(null);
    setDetailLoading(true);
    // On narrow screens the case sits below the queue; bring it into view.
    const panel = detailRef.current;
    if (panel && typeof panel.scrollIntoView === "function" && typeof window !== "undefined" && window.innerWidth < 1024) {
      panel.scrollIntoView({ block: "start" });
    }
    try {
      setDetail(await api.getCase(caseId));
    } catch (error) {
      if (!applyAccessError(error)) setDetailError(reviewErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (input: ReviewDecisionInput) => {
    if (!detail || decisionInFlight.current) return;
    decisionInFlight.current = true;
    const caseId = detail.case.case_id;
    setDeciding(true);
    setDecisionError(null);
    setDecisionResult(null);
    try {
      const result = await api.decide(caseId, input);
      setDecisionResult(result);
      setItems((current) =>
        current.map((item) =>
          item.case_id === caseId
            ? { ...item, status: result.case.status, disposition: result.case.disposition, updated_at: result.case.updated_at }
            : item,
        ),
      );
      // Re-read the case for its appended event and any resulting version;
      // until that answers, show the decision's own case and allowed actions.
      setDetail((current) => (current ? { ...current, case: result.case, allowed_decisions: result.allowed_decisions, publication_boundary: result.publication_boundary } : current));
      try {
        setDetail(await api.getCase(caseId));
      } catch {
        // The decision stands; the refreshed history can be loaded again.
      }
    } catch (error) {
      setDecisionError(reviewErrorMessage(error));
    } finally {
      decisionInFlight.current = false;
      setDeciding(false);
    }
  };

  const accessCopy = access ? ACCESS_COPY[access] : null;

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8" data-testid="feedback-review-page">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Mission Control</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Feedback review · owner decisions</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Corrections and challenges submitted from records, with the exact record version each submitter saw. Submitters and
              reviewers appear only as opaque references, never as identities.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost"><Link to="/mission-control">Back to Mission Control</Link></Button>
            <Button onClick={() => void loadQueue()} disabled={queueState === "loading"} variant="outline" data-testid="feedback-review-refresh">
              <RefreshCw className={`mr-2 h-4 w-4 ${queueState === "loading" ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        <p role="note" className="flex items-start gap-2 rounded-md border-2 border-amber-600/60 bg-amber-50 p-3 text-sm font-medium text-amber-950" data-testid="feedback-review-boundary-notice">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{PUBLICATION_BOUNDARY_NOTICE}</span>
        </p>

        {accessCopy ? (
          <Card className={access === "outage" || access === "unavailable" ? "border-destructive/40" : "border-amber-500/40"} data-testid={`feedback-review-access-${access}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {access === "outage" || access === "unavailable" ? <AlertTriangle className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                {accessCopy.title}
              </CardTitle>
              <CardDescription>{accessCopy.body}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {access === "sign_in_required" || access === "owner_session_required" ? (
                <Button asChild size="sm" data-testid="feedback-review-sign-in"><Link to="/mission-control">Sign in at Mission Control</Link></Button>
              ) : null}
              {access === "outage" ? (
                <Button size="sm" variant="outline" onClick={() => void loadQueue()}>Try again</Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {!access ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquareWarning className="h-5 w-5" /> Submitted cases</CardTitle>
                <CardDescription>
                  {queueState === "loading" ? "Loading…" : queueState === "ready" ? `${items.length} shown${nextCursor ? " · more available" : ""}, newest first.` : ""}
                </CardDescription>
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <label className="text-xs font-medium">
                    Status
                    <select
                      className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={statusFilter}
                      data-testid="feedback-review-filter-status"
                      onChange={(event) => setStatusFilter(event.target.value as FeedbackCaseStatus | "")}
                    >
                      <option value="">All statuses</option>
                      {REVIEW_STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-medium">
                    Record type
                    <select
                      className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={objectTypeFilter}
                      data-testid="feedback-review-filter-object-type"
                      onChange={(event) => setObjectTypeFilter(event.target.value as EvidenceObjectType | "")}
                    >
                      <option value="">All record types</option>
                      {REVIEW_OBJECT_TYPE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
              </CardHeader>
              <CardContent>
                {queueError ? (
                  <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="feedback-review-queue-error">{queueError}</p>
                ) : null}
                {queueState === "ready" && items.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="feedback-review-empty">No submitted cases match these filters.</p>
                ) : null}
                <ul className="space-y-2" data-testid="feedback-review-queue">
                  {items.map((item) => (
                    <li key={item.case_id}>
                      <button
                        type="button"
                        onClick={() => void openCase(item.case_id)}
                        aria-current={selectedId === item.case_id ? "true" : undefined}
                        data-testid={`feedback-review-item-${item.case_id}`}
                        className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/40 ${selectedId === item.case_id ? "border-primary ring-1 ring-primary" : ""}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{humanize(item.object_type)} · {humanize(item.feedback_class)}</span>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="mt-1 line-clamp-3 break-words text-sm">{item.statement_preview}</p>
                        <p className="mt-1 break-all text-[11px] text-muted-foreground">
                          {formatTime(item.created_at)} · {item.duplicate_count} duplicate{item.duplicate_count === 1 ? "" : "s"} · submitter ref (opaque){" "}
                          <span className="font-mono">{item.submitter_ref ?? "—"}</span>
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
                {moreError ? (
                  <p role="alert" className="mt-3 text-sm text-destructive" data-testid="feedback-review-more-error">{moreError}</p>
                ) : null}
                {queueState === "ready" && nextCursor ? (
                  <Button className="mt-3 w-full" variant="outline" onClick={() => void loadMore()} disabled={loadingMore} data-testid="feedback-review-load-more">
                    <ChevronDown className="mr-2 h-4 w-4" /> {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Card className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto" ref={detailRef}>
              <CardContent className="pt-6">
                {detailLoading ? <p className="text-sm text-muted-foreground">Loading case…</p> : null}
                {detailError ? (
                  <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="feedback-review-detail-error">{detailError}</p>
                ) : null}
                {!selectedId ? <p className="text-sm text-muted-foreground" data-testid="feedback-review-detail-empty">Select a case to read it in full and decide.</p> : null}
                {detail ? (
                  <CaseDetail detail={detail} busy={deciding} decisionError={decisionError} decisionResult={decisionResult} onDecide={(input) => void decide(input)} />
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </main>
  );
}
