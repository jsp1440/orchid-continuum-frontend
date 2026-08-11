export interface CalyxSurfaceContext {
  surface: string;
  module: string;
  object_type?: string;
  object_id?: string;
  label?: string;
  path?: string;
  observed_at: string;
  metadata?: Record<string, unknown>;
}

export interface CalyxSessionContext {
  current: CalyxSurfaceContext | null;
  trail: CalyxSurfaceContext[];
}

const SESSION_CONTEXT_KEY = 'oc-calyx-session-context:v1';
const MAX_TRAIL = 20;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function sameSurface(a: CalyxSurfaceContext, b: CalyxSurfaceContext): boolean {
  return a.surface === b.surface
    && a.module === b.module
    && a.object_type === b.object_type
    && a.object_id === b.object_id
    && a.path === b.path;
}

export function readCalyxSessionContext(): CalyxSessionContext {
  const store = storage();
  if (!store) return { current: null, trail: [] };
  const raw = store.getItem(SESSION_CONTEXT_KEY);
  if (!raw) return { current: null, trail: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<CalyxSessionContext>;
    return {
      current: parsed.current ?? null,
      trail: Array.isArray(parsed.trail) ? parsed.trail.slice(-MAX_TRAIL) : [],
    };
  } catch {
    store.removeItem(SESSION_CONTEXT_KEY);
    return { current: null, trail: [] };
  }
}

export function recordCalyxSurfaceContext(
  context: Omit<CalyxSurfaceContext, 'observed_at'> & { observed_at?: string },
): CalyxSessionContext {
  const next: CalyxSurfaceContext = {
    ...context,
    observed_at: context.observed_at ?? new Date().toISOString(),
  };
  const prior = readCalyxSessionContext();
  const last = prior.trail.at(-1);
  const trail = last && sameSurface(last, next)
    ? [...prior.trail.slice(0, -1), next]
    : [...prior.trail, next].slice(-MAX_TRAIL);
  const value = { current: next, trail };
  storage()?.setItem(SESSION_CONTEXT_KEY, JSON.stringify(value));
  return value;
}

export function calyxContextPacket(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const session = readCalyxSessionContext();
  return {
    ...extra,
    current_surface: session.current,
    session_trail: session.trail.slice(-8),
    context_is_evidence: false,
    context_purpose: 'interaction continuity and reference resolution only',
  };
}

export function clearCalyxSessionContext(): void {
  storage()?.removeItem(SESSION_CONTEXT_KEY);
}
