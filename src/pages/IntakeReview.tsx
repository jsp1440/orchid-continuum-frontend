import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Inbox, Lock, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  createIntakeReviewClient,
  IntakeReviewApiError,
  MODERATION_TARGETS,
  PENDING_STATES,
  moderationTargetLabel,
  type ContactMessage,
  type IntakeReviewClient,
  type ModerationTarget,
  type PendingObservation,
  type SubscriptionSummary,
} from "@/lib/intakeReview";

/**
 * Intake review — the human moderation path for Release-1 journeys 10 and 13.
 *
 * A moderator reads each pending community observation in full (the only
 * place its verbatim locality is shown), decides, and records why. Approval
 * releases an observer report to the public feed; it never makes a
 * scientific claim. Contact messages are read here by a person and are never
 * forwarded to an automated agent.
 */

export interface IntakeReviewProps {
  /** Test / integration seam. */
  client?: IntakeReviewClient;
}

type LoadState = "loading" | "ready" | "authentication_required" | "unavailable" | "error";

export default function IntakeReview({ client }: IntakeReviewProps) {
  const { session } = useAuth();
  const api = useMemo(
    () => client ?? createIntakeReviewClient({ accessToken: session?.access_token ?? null }),
    [client, session?.access_token],
  );

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingObservation[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const [observations, inbox, counts] = await Promise.all([api.listPending(), api.listContactMessages(), api.subscriptionSummary()]);
      setPending(observations);
      setMessages(inbox.items);
      setSummary(counts);
      setState("ready");
    } catch (caught) {
      if (caught instanceof IntakeReviewApiError && caught.kind === "authentication_required") {
        setState("authentication_required");
        return;
      }
      if (caught instanceof IntakeReviewApiError && caught.kind === "route_unavailable") {
        setState("unavailable");
        return;
      }
      setState("error");
      setError(caught instanceof Error ? caught.message : "Intake review could not be loaded.");
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (observation: PendingObservation, target: ModerationTarget) => {
    setBusyId(observation.id);
    setDecisionNote(null);
    setError(null);
    try {
      const result = await api.moderate(observation.id, target, reasons[observation.id]);
      if (PENDING_STATES.includes(result.moderation_state as (typeof PENDING_STATES)[number])) {
        setPending((current) =>
          current.map((item) =>
            item.id === observation.id
              ? { ...item, moderation_state: result.moderation_state }
              : item,
          ),
        );
      } else {
        setPending((current) => current.filter((item) => item.id !== observation.id));
      }
      setReasons((current) => ({ ...current, [observation.id]: "" }));
      setDecisionNote(
        result.moderation_state === "APPROVED"
          ? `Observation ${observation.id.slice(0, 8)}… approved: it now appears in the community feed as an observer report (${observation.epistemic_label} self-assessed), not as a scientific finding.`
          : `Observation ${observation.id.slice(0, 8)}… recorded as ${result.moderation_state.toLowerCase()}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The decision could not be recorded.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8" data-testid="intake-review-page">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Mission Control</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Intake review · human moderation</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground" data-testid="intake-review-epistemic-notice">
              Community observations are user reports with a self-assessed certainty label. Approving one releases it to the
              public feed as a community report; it does not make it a scientific fact and nothing here writes to the Knowledge
              Graph. Verbatim locality is shown only on this page. Contact messages are untrusted plain text read by a person and
              are never passed to an automated agent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/mission-control">Back to Mission Control</Link></Button>
            <Button onClick={() => void load()} disabled={state === "loading"} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${state === "loading" ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {state === "authentication_required" ? (
          <Card className="border-amber-500/40" data-testid="intake-review-auth-required">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Owner session required</CardTitle>
              <CardDescription>
                The moderation view and the contact inbox are behind the Calyx owner boundary. Sign in to Mission Control with
                the owner session and refresh. Nothing was changed.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {state === "unavailable" ? (
          <Card className="border-destructive/40" data-testid="intake-review-unavailable">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Intake review API not deployed</CardTitle>
              <CardDescription>The community-observation or constituent routes are not live on this backend.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {error ? (
          <p role="alert" data-testid="intake-review-error" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {decisionNote ? (
          <p role="status" data-testid="intake-review-decision" className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
            {decisionNote}
          </p>
        ) : null}

        {state === "ready" || state === "loading" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Pending community observations</CardTitle>
                <CardDescription>
                  {state === "loading" ? "Loading…" : `${pending.length} awaiting a decision. Each record is shown in full for moderation only.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {state === "ready" && pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="intake-pending-empty">No submissions are waiting.</p>
                ) : null}
                <ul className="space-y-4" data-testid="intake-pending-list">
                  {pending.map((observation) => (
                    <li key={observation.id} className="rounded-lg border p-4" data-testid={`intake-pending-item-${observation.id}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold italic">{observation.taxon_name_verbatim}</p>
                          <p className="text-xs text-muted-foreground">
                            Observed {observation.observation_date} · submitted {new Date(observation.created_at).toLocaleString()} · submitter{" "}
                            <code>{observation.submitter_auth_subject}</code>
                          </p>
                        </div>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide">
                          {observation.moderation_state} · {observation.epistemic_label} self-assessed
                        </span>
                      </div>
                      <p className="mt-3 flex items-start gap-2 text-sm" data-testid={`intake-pending-locality-${observation.id}`}>
                        <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <span>
                          <span className="font-medium">Verbatim locality (protected · moderation view only):</span> {observation.location_verbatim}
                        </span>
                      </p>
                      {observation.notes ? <p className="mt-2 whitespace-pre-wrap text-sm">{observation.notes}</p> : null}
                      <label className="mt-3 block text-xs font-medium" htmlFor={`reason-${observation.id}`}>
                        Decision reason (recorded with the decision)
                      </label>
                      <textarea
                        id={`reason-${observation.id}`}
                        data-testid={`moderate-reason-${observation.id}`}
                        value={reasons[observation.id] ?? ""}
                        onChange={(event) => setReasons((current) => ({ ...current, [observation.id]: event.target.value }))}
                        maxLength={2000}
                        rows={2}
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {MODERATION_TARGETS.map((target) => (
                          <Button
                            key={target}
                            size="sm"
                            variant={target === "APPROVED" ? "default" : target === "REJECTED" ? "destructive" : "outline"}
                            disabled={busyId !== null}
                            data-testid={`moderate-${observation.id}-${target}`}
                            onClick={() => void decide(observation, target)}
                          >
                            {moderationTargetLabel(target)}
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" /> Contact inbox</CardTitle>
                  <CardDescription>
                    {state === "loading" ? "Loading…" : `${messages.length} message${messages.length === 1 ? "" : "s"}, newest first. Untrusted plain text; never forwarded to agents.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {state === "ready" && messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="intake-contact-empty">No messages.</p>
                  ) : null}
                  <ul className="space-y-3" data-testid="intake-contact-list">
                    {messages.map((message) => (
                      <li key={message.reference_id} className="rounded-lg border p-3" data-testid={`intake-contact-item-${message.reference_id}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            <span className="rounded-full border px-2 py-0.5 uppercase tracking-wide">{message.category}</span>{" "}
                            {message.name ? `${message.name} · ` : ""}
                            <code>{message.normalized_email}</code>
                          </span>
                          <span>{new Date(message.received_at).toLocaleString()} · {message.reference_id}</span>
                        </div>
                        {message.subject ? <p className="mt-2 font-medium">{message.subject}</p> : null}
                        <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card data-testid="intake-subscription-summary">
                <CardHeader>
                  <CardTitle className="text-base">Newsletter subscriptions</CardTitle>
                  <CardDescription>Counts only. Addresses never leave the record store through this view.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Total records</span><strong>{summary?.total ?? "—"}</strong></div>
                  {Object.entries(summary?.by_state ?? {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between"><span className="capitalize">{key.replace(/_/g, " ")}</span><strong>{value}</strong></div>
                  ))}
                  <div className="flex justify-between border-t pt-2">
                    <span>Welcome emails held for approval</span>
                    <strong>{summary?.welcome_communications_awaiting_approval ?? "—"}</strong>
                  </div>
                  <p className="text-xs text-muted-foreground">No email is sent from this page; approval of any communication remains a separate owner action.</p>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
