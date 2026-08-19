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
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
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
  try {
    const raw = store.getItem(SESSION_CONTEXT_KEY);
    if (!raw) return { current: null, trail: [] };
    const parsed = JSON.parse(raw) as Partial<CalyxSessionContext>;
    return {
      current: parsed.current ?? null,
      trail: Array.isArray(parsed.trail) ? parsed.trail.slice(-MAX_TRAIL) : [],
    };
  } catch {
    try {
      store.removeItem(SESSION_CONTEXT_KEY);
    } catch {
      // Storage can be unavailable or quota-restricted. Context remains optional.
    }
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
  const store = storage();
  if (store) {
    try {
      store.setItem(SESSION_CONTEXT_KEY, JSON.stringify(value));
    } catch {
      // UI context is helpful but non-authoritative. Storage failures must never
      // crash the scientific workspace or convert context into a hard dependency.
    }
  }
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
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SESSION_CONTEXT_KEY);
  } catch {
    // Clearing optional UI context must also fail soft.
  }
}
