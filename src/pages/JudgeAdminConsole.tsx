import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Copy, KeyRound, Printer, RefreshCw, ScrollText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createJudgeAdminClient,
  judgeAdminErrorMessage,
  type IssuedJudgeCredential,
  type JudgeAdminClient,
  type JudgeAuditRow,
  type JudgeCredentialMeta,
  type ReissueResult,
} from "@/lib/judgeAdmin";

/**
 * Owner console for per-judge credentials (Gate 8).
 *
 * Behind the Mission Control owner session: requests go through the owner
 * bearer transport, never with the service owner key. The owner issues,
 * rotates and revokes judge credentials (the token is shown exactly once, with
 * a copy button, and is never stored), reads the judge audit, and re-issues
 * legacy tag codes before reprinting tags for a blind event.
 */

export interface JudgeAdminConsoleProps {
  /** Test / integration seam. */
  client?: JudgeAdminClient;
}

const idList = (value: string): string[] =>
  value
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);

function Failure({ error, testId }: { error: unknown; testId: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-600/50 bg-amber-50 p-3 text-sm text-amber-950" data-testid={testId}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{judgeAdminErrorMessage(error)}</span>
    </p>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** The one place an issued token is rendered. It lives only in this component's state. */
function TokenOnce({ issued, onDone }: { issued: IssuedJudgeCredential; onDone: () => void }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };
  return (
    <div className="space-y-2 rounded-md border-2 border-amber-600 bg-amber-50 p-3" data-testid="judge-admin-token-once">
      <p className="text-sm font-semibold">Judge credential — shown once</p>
      <p className="text-xs">
        {issued.token_notice ?? "Shown once. Only a keyed hash is stored; issue a new credential if it is lost."} Give it to the
        judge privately. Expires {formatTime(issued.expires_at)}.
        {issued.revoked_previous > 0 ? ` Rotation revoked ${issued.revoked_previous} earlier credential(s).` : ""}
      </p>
      <code className="block break-all rounded bg-white p-2 font-mono text-xs" data-testid="judge-admin-token-value">
        {issued.token}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copy()} data-testid="judge-admin-token-copy">
          <Copy className="mr-1 h-4 w-4" aria-hidden="true" /> Copy
        </Button>
        <Button size="sm" variant="outline" onClick={onDone} data-testid="judge-admin-token-done">
          I have given it to the judge — hide it
        </Button>
        {copied === "copied" ? <span className="text-xs" role="status">Copied.</span> : null}
        {copied === "failed" ? <span className="text-xs" role="status">Copy failed; select the text instead.</span> : null}
      </div>
    </div>
  );
}

function CredentialsPanel({ client }: { client: JudgeAdminClient }) {
  const [judgeId, setJudgeId] = useState("");
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState("1440");
  const [eventIds, setEventIds] = useState("");
  const [categoryIds, setCategoryIds] = useState("");
  const [rotate, setRotate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [issued, setIssued] = useState<IssuedJudgeCredential | null>(null);
  const [credentials, setCredentials] = useState<JudgeCredentialMeta[] | null>(null);

  const load = async (id = judgeId.trim()) => {
    if (!id) return;
    setError(null);
    try {
      setCredentials(await client.listCredentials(id));
    } catch (e) {
      setCredentials(null);
      setError(e);
    }
  };

  const issue = async (event: FormEvent) => {
    event.preventDefault();
    const id = judgeId.trim();
    if (!id) return;
    setBusy(true);
    setError(null);
    setIssued(null);
    try {
      const minutesValue = Number(minutes);
      const result = await client.issueCredential(id, {
        label: label.trim() || null,
        expires_in_minutes: Number.isFinite(minutesValue) && minutesValue > 0 ? Math.round(minutesValue) : undefined,
        event_ids: idList(eventIds),
        category_ids: idList(categoryIds),
        rotate,
      });
      setIssued(result);
      setLabel("");
      await load(id);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (credentialId: string) => {
    setBusy(true);
    setError(null);
    try {
      await client.revokeCredential(credentialId);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="judge-admin-credentials">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden="true" /> Judge credentials
        </CardTitle>
        <CardDescription>
          Issue a personal credential for one judge. Rotation (on by default) revokes the judge’s other active credentials.
          The credential opens only the judge portal; it never opens owner routes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={issue} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Judge id
            <Input value={judgeId} onChange={(e) => setJudgeId(e.target.value)} data-testid="judge-admin-judge-id" autoComplete="off" />
          </label>
          <label className="text-sm">
            Label (device)
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} data-testid="judge-admin-label" />
          </label>
          <label className="text-sm">
            Expires in minutes (5 to 20160)
            <Input type="number" min={5} max={20160} value={minutes} onChange={(e) => setMinutes(e.target.value)} data-testid="judge-admin-minutes" />
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} data-testid="judge-admin-rotate" />
            Rotate (revoke this judge’s other active credentials)
          </label>
          <label className="text-sm">
            Limit to event ids (optional, comma separated)
            <Input value={eventIds} onChange={(e) => setEventIds(e.target.value)} data-testid="judge-admin-event-ids" />
          </label>
          <label className="text-sm">
            Limit to category ids (optional, comma separated)
            <Input value={categoryIds} onChange={(e) => setCategoryIds(e.target.value)} data-testid="judge-admin-category-ids" />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy || !judgeId.trim()} data-testid="judge-admin-issue">
              Issue credential
            </Button>
            <Button type="button" variant="outline" disabled={busy || !judgeId.trim()} onClick={() => void load()} data-testid="judge-admin-load">
              Show this judge’s credentials
            </Button>
          </div>
        </form>

        {issued ? <TokenOnce issued={issued} onDone={() => setIssued(null)} /> : null}
        {error ? <Failure error={error} testId="judge-admin-credentials-error" /> : null}

        {credentials ? (
          credentials.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="judge-admin-no-credentials">
              This judge has no credentials yet.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="judge-admin-credential-list">
              {credentials.map((c) => (
                <li key={c.credential_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm" data-testid="judge-admin-credential">
                  <span>
                    <span className="font-mono text-xs">{c.credential_id}</span> · {c.label ?? "no label"} ·{" "}
                    <strong data-testid="judge-admin-credential-state">{c.state}</strong> · expires {formatTime(c.expires_at)}
                    {c.scope.event_ids ? ` · events: ${c.scope.event_ids.join(", ")}` : ""}
                    {c.scope.category_ids ? ` · classes: ${c.scope.category_ids.join(", ")}` : ""}
                  </span>
                  {c.state === "active" ? (
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => void revoke(c.credential_id)} data-testid={`judge-admin-revoke-${c.credential_id}`}>
                      Revoke
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function AuditPanel({ client }: { client: JudgeAdminClient }) {
  const [eventId, setEventId] = useState("");
  const [judgeId, setJudgeId] = useState("");
  const [rows, setRows] = useState<JudgeAuditRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setRows(await client.audit({ judgingEventId: eventId.trim() || undefined, judgeId: judgeId.trim() || undefined, limit: 200 }));
    } catch (e) {
      setRows(null);
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="judge-admin-audit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" aria-hidden="true" /> Judge audit
        </CardTitle>
        <CardDescription>Every judge-portal action, allowed or refused, newest first (append-only; holds no exhibitor data).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={load} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Event id
            <Input value={eventId} onChange={(e) => setEventId(e.target.value)} data-testid="judge-admin-audit-event" />
          </label>
          <label className="text-sm">
            Judge id
            <Input value={judgeId} onChange={(e) => setJudgeId(e.target.value)} data-testid="judge-admin-audit-judge" />
          </label>
          <Button type="submit" disabled={busy} data-testid="judge-admin-audit-load">
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" /> Load audit
          </Button>
        </form>
        {error ? <Failure error={error} testId="judge-admin-audit-error" /> : null}
        {rows ? (
          rows.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="judge-admin-audit-empty">
              No judge actions recorded for these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" data-testid="judge-admin-audit-table">
                <thead>
                  <tr>
                    <th className="p-1">When</th>
                    <th className="p-1">Judge</th>
                    <th className="p-1">Action</th>
                    <th className="p-1">Outcome</th>
                    <th className="p-1">HTTP</th>
                    <th className="p-1">Plant handle</th>
                    <th className="p-1">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t" data-testid="judge-admin-audit-row">
                      <td className="p-1">{formatTime(r.created_at)}</td>
                      <td className="p-1 font-mono">{r.judge_id}</td>
                      <td className="p-1">{r.action}</td>
                      <td className="p-1">{r.outcome}</td>
                      <td className="p-1">{r.http_status ?? "—"}</td>
                      <td className="p-1 font-mono">{r.plant_handle ?? "—"}</td>
                      <td className="p-1">{r.detail ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function TagsPanel({ client }: { client: JudgeAdminClient }) {
  const [eventId, setEventId] = useState("");
  const [includeRandom, setIncludeRandom] = useState(false);
  const [result, setResult] = useState<ReissueResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const reissue = async () => {
    setBusy(true);
    setError(null);
    setConfirming(false);
    try {
      setResult(await client.reissueQrTokens(eventId.trim(), includeRandom));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const reprint = async () => {
    setBusy(true);
    setError(null);
    // Open synchronously (popup blockers), then fill it once the sheet arrives.
    const win = typeof window.open === "function" ? window.open("", "_blank") : null;
    try {
      const html = await client.tagSheetHtml(eventId.trim());
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      if (win) win.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      win?.close();
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="judge-admin-tags">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" aria-hidden="true" /> Re-issue and reprint tags
        </CardTitle>
        <CardDescription>
          Blind events refuse scans of tags that still carry a retired (id-derived) code. Re-issue replaces those codes with
          random ones; then reprint the tag sheet and replace the tags on the bench. Refused while judging is locked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm">
          Judging event id
          <Input value={eventId} onChange={(e) => setEventId(e.target.value)} data-testid="judge-admin-tags-event" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeRandom} onChange={(e) => setIncludeRandom(e.target.checked)} data-testid="judge-admin-tags-all" />
          Replace every tag code in the event (for example after a tag sheet was lost), not only retired ones
        </label>
        <div className="flex flex-wrap gap-2">
          {confirming ? (
            <>
              <Button variant="destructive" disabled={busy} onClick={() => void reissue()} data-testid="judge-admin-tags-confirm">
                Confirm: re-issue {includeRandom ? "all" : "retired"} tag codes
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button disabled={busy || !eventId.trim()} onClick={() => setConfirming(true)} data-testid="judge-admin-tags-reissue">
              Re-issue tag codes
            </Button>
          )}
          <Button variant="outline" disabled={busy || !eventId.trim()} onClick={() => void reprint()} data-testid="judge-admin-tags-reprint">
            Reprint tag sheet
          </Button>
        </div>
        {result ? (
          <p className="text-sm" role="status" data-testid="judge-admin-tags-result">
            Re-issued {result.reissued} of {result.plants} tag code(s). {result.reissued > 0 ? "Reprint the tag sheet now; the old tags no longer scan." : "Nothing needed re-issuing."}
          </p>
        ) : null}
        {error ? <Failure error={error} testId="judge-admin-tags-error" /> : null}
      </CardContent>
    </Card>
  );
}

export default function JudgeAdminConsole({ client: injected }: JudgeAdminConsoleProps) {
  const client = useMemo(() => injected ?? createJudgeAdminClient(), [injected]);
  return (
    <main className="min-h-screen bg-cream px-4 py-10" data-testid="judge-admin-console">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Mission Control · owner</p>
          <h1 className="text-2xl font-semibold">Show judging — judge access</h1>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Owner session only. Judges sign in at <Link to="/judge" className="underline">/judge</Link> with their own credential
            and never receive the owner key.
          </p>
        </header>
        <CredentialsPanel client={client} />
        <AuditPanel client={client} />
        <TagsPanel client={client} />
      </div>
    </main>
  );
}
