import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock3, History } from 'lucide-react';
import {
  UniversityApiError,
  universityApi,
  type UniversityLabSession,
  type UniversitySessionSummary,
} from '@/lib/universityApi';

function discoveryError(error: unknown): string {
  if (error instanceof UniversityApiError) {
    if (error.status === 401) return 'Your learner session expired. Sign in again to view investigations.';
    return error.detail?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'Could not load your investigations.';
}

function updatedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated recently';
  return `Updated ${date.toLocaleString()}`;
}

function learnerCacheKey(accessToken: string): string | null {
  try {
    const [, payload] = accessToken.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const claims = JSON.parse(decoded) as { sub?: unknown };
    const subject = typeof claims.sub === 'string' ? claims.sub.trim() : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subject)
      ? subject
      : null;
  } catch {
    return null;
  }
}

export default function UniversityMyInvestigations({
  accessToken,
  onOpen,
}: {
  accessToken: string;
  onOpen: (session: UniversityLabSession) => void;
}) {
  const learnerKey = useMemo(() => learnerCacheKey(accessToken), [accessToken]);
  const [extra, setExtra] = useState<UniversitySessionSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setExtra([]);
    setNextCursor(undefined);
    setMessage(null);
  }, [learnerKey]);

  const initial = useQuery({
    queryKey: ['university-my-investigations', learnerKey],
    queryFn: () => universityApi.listSessions(accessToken, null, 10),
    enabled: learnerKey !== null,
    retry: false,
  });

  useEffect(() => {
    if (initial.data && nextCursor === undefined) setNextCursor(initial.data.next_cursor);
  }, [initial.data, nextCursor]);

  const sessions = useMemo(
    () => [...(initial.data?.sessions ?? []), ...extra],
    [initial.data?.sessions, extra],
  );

  const loadMore = useMutation({
    mutationFn: () => universityApi.listSessions(accessToken, nextCursor ?? null, 10),
    onSuccess: (page) => {
      setExtra((current) => {
        const known = new Set(current.map((item) => item.session_id));
        const initialIds = new Set((initial.data?.sessions ?? []).map((item) => item.session_id));
        return [
          ...current,
          ...page.sessions.filter((item) => !known.has(item.session_id) && !initialIds.has(item.session_id)),
        ];
      });
      setNextCursor(page.next_cursor);
      setMessage(null);
    },
    onError: (error) => setMessage(discoveryError(error)),
  });

  const openSession = useMutation({
    mutationFn: (sessionId: string) => universityApi.session(sessionId, accessToken),
    onSuccess: (session) => {
      setMessage(null);
      onOpen(session);
    },
    onError: (error) => setMessage(discoveryError(error)),
  });

  if (learnerKey === null) {
    return (
      <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-5 text-sm text-amber-50/80">
        Your learner identity could not be partitioned safely for local session discovery. Sign in again before viewing saved investigations.
      </div>
    );
  }

  if (initial.isLoading) {
    return <div className="mt-6 text-sm text-white/55">Loading your investigations…</div>;
  }

  if (initial.isError) {
    return <div className="mt-6 text-sm text-red-200">{discoveryError(initial.error)}</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-white/10 bg-black/10 p-5 text-sm text-white/60">
        You do not have a saved investigation yet. Start one below; it will appear here automatically.
      </div>
    );
  }

  return (
    <div className="mt-7 rounded-xl border border-white/10 bg-black/10 p-5">
      <div className="mb-4 flex items-center gap-2 text-sky-100">
        <History className="h-4 w-4" />
        <h3 className="font-serif text-xl">My investigations</h3>
      </div>
      <div className="space-y-3">
        {sessions.map((item) => (
          <div
            key={item.session_id}
            className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-white/85">
                {item.current_stage} · {item.status.replaceAll('_', ' ')}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-white/45">
                <Clock3 className="h-3.5 w-3.5" /> {updatedLabel(item.updated_at)} · revision {item.revision}
              </div>
            </div>
            <button
              type="button"
              onClick={() => openSession.mutate(item.session_id)}
              disabled={openSession.isPending}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-200/25 bg-sky-200/10 px-3 py-2 text-sm text-sky-50 disabled:opacity-50"
            >
              Resume <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {nextCursor && (
        <button
          type="button"
          onClick={() => loadMore.mutate()}
          disabled={loadMore.isPending}
          className="mt-4 rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 disabled:opacity-50"
        >
          {loadMore.isPending ? 'Loading…' : 'Load more investigations'}
        </button>
      )}
      {message && <p className="mt-4 text-sm text-red-200">{message}</p>}
    </div>
  );
}
