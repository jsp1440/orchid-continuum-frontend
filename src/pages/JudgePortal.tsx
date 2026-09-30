import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, EyeOff, KeyRound, LogOut, QrCode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  JUDGE_SIGNED_OUT_EVENT,
  clearJudgeToken,
  hasJudgeToken,
  normalizeJudgeTokenInput,
  storeJudgeToken,
} from "@/lib/judgePortalAuth";
import {
  JudgePortalError,
  createJudgePortalClient,
  judgeErrorMessage,
  plantDisplayName,
  qrTokenFromScan,
  shortHandle,
  type JudgeAward,
  type JudgeCategory,
  type JudgeEvent,
  type JudgeMe,
  type JudgePlant,
  type JudgePortalClient,
  type JudgeScan,
  type JudgeScorecard,
} from "@/lib/judgePortal";

/**
 * Judge portal — the judge's own device on show day (Gate 8).
 *
 * The judge signs in with the personal credential the show owner issued
 * (`ocj_…`), held for this tab only. Everything shown comes from
 * `/api/judge-portal/*`, which scopes to the judge's assignments and applies
 * blind judging on the server. Plants and scorecards are named by opaque
 * handles. This page never requests, displays or stores exhibitor data, and
 * never uses the shared owner key.
 */

export interface JudgePortalProps {
  /** Test / integration seam. */
  client?: JudgePortalClient;
}

type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; error: unknown };

function useLoad<T>(load: () => Promise<T>, deps: unknown[]): [Load<T>, () => void] {
  const [value, setValue] = useState<Load<T>>({ state: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setValue({ state: "loading" });
    load().then(
      (data) => live && setValue({ state: "ready", data }),
      (error) => live && setValue({ state: "error", error }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return [value, () => setTick((n) => n + 1)];
}

function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const kind = error instanceof JudgePortalError ? error.kind : "unavailable";
  return (
    <div role="alert" className="rounded-md border border-amber-600/50 bg-amber-50 p-3 text-sm text-amber-950" data-testid={`judge-error-${kind}`}>
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{judgeErrorMessage(error)}</span>
      </p>
      {onRetry && kind !== "unauthenticated" ? (
        <Button size="sm" variant="outline" className="mt-2" onClick={onRetry} data-testid="judge-retry">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="text-sm text-muted-foreground" data-testid="judge-loading">
      {label}
    </p>
  );
}

function BlindNotice() {
  return (
    <p className="flex items-start gap-2 rounded-md border border-stone-300 bg-stone-50 p-3 text-sm" data-testid="judge-blind-notice">
      <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Blind judging: the server withholds exhibitor information for this event. Plants are named by an opaque handle; a
        name that could identify the exhibitor is withheld.
      </span>
    </p>
  );
}

function DiscardedNotice({ plants }: { plants: JudgePlant[] }) {
  if (!plants.some((p) => p.withheld_fields_discarded)) return null;
  return (
    <p role="alert" className="rounded-md border border-red-700/40 bg-red-50 p-3 text-sm text-red-950" data-testid="judge-discarded-notice">
      The backend sent fields that blind judging withholds. They were discarded on this device and are not shown. Please tell
      the show owner.
    </p>
  );
}

function PlantName({ plant }: { plant: JudgePlant }) {
  return (
    <span data-testid="judge-plant-name" data-withheld={plant.plant_name_withheld ? "true" : "false"} className={plant.plant_name_withheld ? "italic text-muted-foreground" : "font-semibold italic"}>
      {plantDisplayName(plant)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "submitted" ? "border-emerald-700/40 bg-emerald-50 text-emerald-900" : "border-stone-400 bg-stone-100 text-stone-800";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`} data-testid="judge-scorecard-status">
      {status.replaceAll("_", " ")}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Sign-in                                                                   */
/* ------------------------------------------------------------------------ */

function SignIn({ onSignedIn, notice }: { onSignedIn: () => void; notice: string | null }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const token = normalizeJudgeTokenInput(value);
    setValue("");
    if (!token) {
      setError("That is not a judge credential. Judge credentials start with “ocj_” and are issued by the show owner for you alone.");
      return;
    }
    if (!storeJudgeToken(token)) {
      setError("This browser would not keep the credential for this tab (private mode or storage blocked). Nothing was stored.");
      return;
    }
    setError(null);
    onSignedIn();
  };

  return (
    <Card className="mx-auto max-w-lg" data-testid="judge-sign-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden="true" /> Judge sign-in
        </CardTitle>
        <CardDescription>
          Paste (or scan into this field) the personal judge credential the show owner gave you. It is kept for this browser tab
          only and is removed when you sign out or when it stops being valid.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notice ? (
          <p role="status" className="mb-3 rounded-md border border-amber-600/50 bg-amber-50 p-3 text-sm" data-testid="judge-signed-out-notice">
            {notice}
          </p>
        ) : null}
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="judge-token" className="block text-sm font-semibold">
            Judge credential
          </label>
          <Input
            id="judge-token"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ocj_…"
            data-testid="judge-token-input"
          />
          {error ? (
            <p role="alert" className="text-sm text-red-800" data-testid="judge-sign-in-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={!value.trim()} data-testid="judge-sign-in-submit">
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Views                                                                     */
/* ------------------------------------------------------------------------ */

function EventsView({ client }: { client: JudgePortalClient }) {
  const [events, retry] = useLoad(() => client.events(), [client]);
  if (events.state === "loading") return <Loading label="Loading your assigned events…" />;
  if (events.state === "error") return <ErrorPanel error={events.error} onRetry={retry} />;
  if (events.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="judge-no-events">
        You have no judging assignments on this credential yet. Ask the show owner if that is unexpected.
      </p>
    );
  }
  return (
    <ul className="space-y-2" data-testid="judge-events">
      {events.data.map((event) => (
        <li key={event.id} className="rounded-md border p-3" data-testid="judge-event">
          <Link to={`/judge/events/${encodeURIComponent(event.id)}`} className="font-semibold underline">
            {event.name}
          </Link>
          <span className="ml-2 text-xs text-muted-foreground">
            {event.status}
            {event.is_blind ? " · blind judging" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EventView({ client }: { client: JudgePortalClient }) {
  const { eventId = "" } = useParams();
  const [categoryId, setCategoryId] = useState<string>("");
  const [data, retry] = useLoad(async () => {
    const events = await client.events();
    const event = events.find((e) => e.id === eventId);
    if (!event) throw new JudgePortalError(404, "not_assigned", "Not found in your judging assignments");
    const [categories, plants] = await Promise.all([client.categories(eventId), client.plants(eventId, event.is_blind)]);
    return { event, categories, plants };
  }, [client, eventId]);

  if (data.state === "loading") return <Loading label="Loading classes and plants…" />;
  if (data.state === "error") return <ErrorPanel error={data.error} onRetry={retry} />;
  const { event, categories, plants } = data.data as { event: JudgeEvent; categories: JudgeCategory[]; plants: JudgePlant[] };
  const shown = categoryId ? plants.filter((p) => p.category_id === categoryId) : plants;

  return (
    <div className="space-y-4" data-testid="judge-event-view">
      <h2 className="text-xl font-semibold">{event.name}</h2>
      {event.is_blind ? <BlindNotice /> : null}
      <DiscardedNotice plants={plants} />
      <div>
        <label htmlFor="judge-category" className="block text-sm font-semibold">
          Class
        </label>
        <select
          id="judge-category"
          className="mt-1 rounded-md border px-2 py-1 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          data-testid="judge-category-filter"
        >
          <option value="">All my classes ({plants.length})</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="judge-no-plants">
          No plants in this class are assigned to you.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="judge-plants">
          {shown.map((plant) => (
            <li key={plant.plant_handle} className="rounded-md border p-3" data-testid="judge-plant">
              <div className="flex flex-wrap items-baseline gap-2">
                <PlantName plant={plant} />
                <span className="text-xs text-muted-foreground">{plant.category_name ?? "Unnamed class"}</span>
                <span className="font-mono text-[11px] text-muted-foreground" title={plant.plant_handle}>
                  {shortHandle(plant.plant_handle)}
                </span>
              </div>
              {plant.notes ? <p className="mt-1 text-xs text-muted-foreground">{plant.notes}</p> : null}
              {plant.scorecard_handle ? (
                <Link to={`/judge/scorecards/${encodeURIComponent(plant.scorecard_handle)}`} className="mt-2 inline-block text-sm underline" data-testid="judge-open-scorecard">
                  Open my scorecard
                </Link>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No scorecard has been generated for you on this plant yet.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SaveState = { state: "idle" } | { state: "saving" } | { state: "saved"; at: Date } | { state: "error"; error: unknown };

function awardFor(awards: JudgeAward[], card: JudgeScorecard): string {
  const scored = new Set((card.scores ?? []).map((s) => s.criterion_id));
  const match = awards.find((a) => a.criteria.some((c) => scored.has(c.criteria_id)));
  if (match) return match.award_id;
  return awards.length === 1 ? awards[0].award_id : "";
}

function ScorecardView({ client }: { client: JudgePortalClient }) {
  const { handle = "" } = useParams();
  const [data, retry] = useLoad(async () => {
    const [card, awards] = await Promise.all([client.scorecard(handle), client.criteria()]);
    return { card, awards };
  }, [client, handle]);
  const [card, setCard] = useState<JudgeScorecard | null>(null);
  const [awardId, setAwardId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (data.state !== "ready") return;
    setCard(data.data.card);
    setAwardId(awardFor(data.data.awards, data.data.card));
    const initial: Record<string, string> = {};
    for (const score of data.data.card.scores ?? []) {
      if (score.value !== null) initial[score.criterion_id] = String(score.value);
    }
    setValues(initial);
  }, [data]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const award = useMemo(
    () => (data.state === "ready" ? data.data.awards.find((a) => a.award_id === awardId) ?? null : null),
    [data, awardId],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const snapshot = pending.current;
    pending.current = null;
    if (!snapshot || !award) return true;
    const scores = award.criteria
      .filter((c) => snapshot[c.criteria_id] !== undefined && snapshot[c.criteria_id] !== "")
      .map((c) => ({ criterion_id: c.criteria_id, value: Number(snapshot[c.criteria_id]) }));
    if (scores.some((s) => !Number.isFinite(s.value))) {
      setSave({ state: "error", error: new JudgePortalError(422, "invalid", "every score must be a number") });
      return false;
    }
    if (scores.length === 0) return true;
    setSave({ state: "saving" });
    try {
      const saved = await client.autosave(handle, scores);
      setCard(saved);
      setSave({ state: "saved", at: new Date() });
      return true;
    } catch (error) {
      setSave({ state: "error", error });
      return false;
    }
  }, [award, client, handle]);

  if (data.state === "loading") return <Loading label="Loading your scorecard…" />;
  if (data.state === "error") return <ErrorPanel error={data.error} onRetry={retry} />;
  if (!card) return <Loading label="Loading your scorecard…" />;

  const submitted = card.status === "submitted";
  const change = (criterionId: string, value: string) => {
    const next = { ...values, [criterionId]: value };
    setValues(next);
    pending.current = next;
    setSave({ state: "idle" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, 800);
  };

  const submit = async () => {
    setSubmitError(null);
    const ok = await flush();
    if (!ok) {
      setConfirming(false);
      return;
    }
    try {
      setCard(await client.submit(handle));
      setConfirming(false);
    } catch (error) {
      setSubmitError(error);
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="judge-scorecard-view">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-xl font-semibold">
          <PlantName plant={card.plant} />
        </h2>
        <StatusBadge status={card.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {card.plant.category_name ?? "Unnamed class"} · plant <span className="font-mono">{shortHandle(card.plant.plant_handle)}</span> · card{" "}
        <span className="font-mono">{shortHandle(card.scorecard_handle)}</span>
      </p>
      {card.plant.blind ? <BlindNotice /> : null}
      <DiscardedNotice plants={[card.plant]} />

      {data.data.awards.length > 1 ? (
        <div>
          <label htmlFor="judge-award" className="block text-sm font-semibold">
            Scoring rubric
          </label>
          <select id="judge-award" className="mt-1 rounded-md border px-2 py-1 text-sm" value={awardId} disabled={submitted} onChange={(e) => setAwardId(e.target.value)} data-testid="judge-award-select">
            <option value="">Choose a rubric…</option>
            {data.data.awards.map((a) => (
              <option key={a.award_id} value={a.award_id}>
                {a.award_name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {award ? (
        <fieldset className="space-y-3" disabled={submitted} data-testid="judge-criteria">
          <legend className="text-sm font-semibold">{award.award_name}</legend>
          {award.criteria.map((c) => (
            <div key={c.criteria_id}>
              <label htmlFor={`criterion-${c.criteria_id}`} className="block text-sm">
                {c.criteria_name}
                {c.points_min !== null || c.points_max !== null ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({c.points_min ?? "–"} to {c.points_max ?? "–"}
                    {c.weighting !== null && c.weighting !== 1 ? `, weight ${c.weighting}` : ""})
                  </span>
                ) : null}
              </label>
              {c.criteria_description ? <p className="text-xs text-muted-foreground">{c.criteria_description}</p> : null}
              <Input
                id={`criterion-${c.criteria_id}`}
                type="number"
                inputMode="decimal"
                min={c.points_min ?? undefined}
                max={c.points_max ?? undefined}
                value={values[c.criteria_id] ?? ""}
                onChange={(e) => change(c.criteria_id, e.target.value)}
                data-testid={`judge-criterion-${c.criteria_id}`}
                className="mt-1 max-w-[10rem]"
              />
            </div>
          ))}
        </fieldset>
      ) : data.data.awards.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="judge-no-criteria">
          No scoring criteria are configured on this backend yet. Ask the show owner.
        </p>
      ) : null}

      <div aria-live="polite" className="text-xs" data-testid="judge-save-state">
        {save.state === "saving" ? "Saving…" : null}
        {save.state === "saved" ? `Saved ${save.at.toLocaleTimeString()}` : null}
      </div>
      {save.state === "error" ? <ErrorPanel error={save.error} /> : null}

      {submitted ? (
        <p className="text-sm" data-testid="judge-submitted">
          Submitted{card.submitted_at ? ` ${new Date(card.submitted_at).toLocaleString()}` : ""}
          {card.total !== null ? ` · total ${card.total}` : ""}. This card can no longer be edited.
        </p>
      ) : confirming ? (
        <div className="flex flex-wrap gap-2 rounded-md border p-3" data-testid="judge-submit-confirm">
          <p className="w-full text-sm">Submit this scorecard? After submitting you cannot change it.</p>
          <Button onClick={() => void submit()} data-testid="judge-submit-confirm-button">
            Confirm submit
          </Button>
          <Button variant="outline" onClick={() => setConfirming(false)}>
            Keep editing
          </Button>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)} disabled={!award} data-testid="judge-submit">
          Submit scorecard
        </Button>
      )}
      {submitError ? <ErrorPanel error={submitError} /> : null}
      <Link to={`/judge/events/${encodeURIComponent(card.judging_event_id)}`} className="block text-sm underline">
        Back to my plants
      </Link>
    </div>
  );
}

function ScanView({ client }: { client: JudgePortalClient }) {
  const { qrToken } = useParams();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<Load<JudgeScan> | null>(null);

  useEffect(() => {
    if (!qrToken) {
      setResult(null);
      return;
    }
    let live = true;
    setResult({ state: "loading" });
    client.scan(qrToken).then(
      (data) => live && setResult({ state: "ready", data }),
      (error) => live && setResult({ state: "error", error }),
    );
    return () => {
      live = false;
    };
  }, [client, qrToken]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const token = qrTokenFromScan(value);
    if (!token) {
      setInputError("That does not look like a plant tag code.");
      return;
    }
    setInputError(null);
    setValue("");
    navigate(`/judge/scan/${encodeURIComponent(token)}`);
  };

  return (
    <div className="space-y-4" data-testid="judge-scan-view">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <QrCode className="h-5 w-5" aria-hidden="true" /> Scan a tag
      </h2>
      <p className="text-sm text-muted-foreground">
        Scan the plant tag with your camera (it opens this page) or type or scan the tag code below.
      </p>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="QR-…" aria-label="Tag code" className="max-w-xs" data-testid="judge-scan-input" autoComplete="off" />
        <Button type="submit" disabled={!value.trim()} data-testid="judge-scan-submit">
          Look up
        </Button>
      </form>
      {inputError ? (
        <p role="alert" className="text-sm text-red-800">
          {inputError}
        </p>
      ) : null}
      {result?.state === "loading" ? <Loading label="Looking up the tag…" /> : null}
      {result?.state === "error" ? <ErrorPanel error={result.error} /> : null}
      {result?.state === "ready" ? (
        <div className="rounded-md border p-3" data-testid="judge-scan-result">
          {result.data.judging_event.is_blind ? <BlindNotice /> : null}
          <DiscardedNotice plants={[result.data.plant]} />
          <p className="mt-2">
            <PlantName plant={result.data.plant} />
          </p>
          <p className="text-xs text-muted-foreground">
            {result.data.judging_event.name} · {result.data.plant.category_name ?? "Unnamed class"} ·{" "}
            <span className="font-mono">{shortHandle(result.data.plant.plant_handle)}</span>
          </p>
          {result.data.scorecard ? (
            <Link to={`/judge/scorecards/${encodeURIComponent(result.data.scorecard.scorecard_handle)}`} className="mt-2 inline-block text-sm underline" data-testid="judge-scan-open-scorecard">
              Open my scorecard ({result.data.scorecard.status})
            </Link>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="judge-scan-no-scorecard">
              This plant is in your assignments, but no scorecard has been generated for you on it yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Shell                                                                     */
/* ------------------------------------------------------------------------ */

function SignedIn({ client, onSignOut }: { client: JudgePortalClient; onSignOut: () => void }) {
  const [me, retry] = useLoad(() => client.me(), [client]);

  let body: ReactNode;
  if (me.state === "loading") body = <Loading label="Checking your judge credential…" />;
  else if (me.state === "error") body = <ErrorPanel error={me.error} onRetry={retry} />;
  else {
    body = (
      <Routes>
        <Route index element={<EventsView client={client} />} />
        <Route path="events/:eventId" element={<EventView client={client} />} />
        <Route path="scorecards/:handle" element={<ScorecardView client={client} />} />
        <Route path="scan" element={<ScanView client={client} />} />
        <Route path="scan/:qrToken" element={<ScanView client={client} />} />
        <Route path="*" element={<p className="text-sm">This judge page does not exist. <Link to="/judge" className="underline">Back to my events</Link></p>} />
      </Routes>
    );
  }

  const profile = me.state === "ready" ? (me.data as JudgeMe) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-warm-white p-3">
        <div className="text-sm" data-testid="judge-identity">
          <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />
          {profile ? (
            <>
              Signed in as <strong>{profile.judge_name}</strong>
              <span className="ml-2 text-xs text-muted-foreground">credential expires {new Date(profile.expires_at).toLocaleString()}</span>
            </>
          ) : (
            "Judge credential on this tab"
          )}
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link to="/judge" className="underline">
            My events
          </Link>
          <Link to="/judge/scan" className="underline" data-testid="judge-nav-scan">
            Scan a tag
          </Link>
          <Button size="sm" variant="outline" onClick={onSignOut} data-testid="judge-sign-out">
            <LogOut className="mr-1 h-4 w-4" aria-hidden="true" /> Sign out
          </Button>
        </nav>
      </div>
      {body}
    </div>
  );
}

const SIGNED_OUT_401 = "You were signed out: the backend no longer accepts that judge credential (revoked, rotated or expired). Ask the show owner for a new one.";

export default function JudgePortal({ client: injected }: JudgePortalProps) {
  const client = useMemo(() => injected ?? createJudgePortalClient(), [injected]);
  const [signedIn, setSignedIn] = useState<boolean>(() => hasJudgeToken());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onSignedOut = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
      setSignedIn(false);
      setNotice(reason === "unauthorized" ? SIGNED_OUT_401 : null);
    };
    window.addEventListener(JUDGE_SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(JUDGE_SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  return (
    <main className="min-h-screen bg-cream px-4 py-10" data-testid="judge-portal">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Show day</p>
          <h1 className="text-2xl font-semibold">Judge portal</h1>
        </header>
        {signedIn ? (
          <SignedIn client={client} onSignOut={() => clearJudgeToken("sign_out")} />
        ) : (
          <SignIn
            notice={notice}
            onSignedIn={() => {
              setNotice(null);
              setSignedIn(true);
            }}
          />
        )}
      </div>
    </main>
  );
}
