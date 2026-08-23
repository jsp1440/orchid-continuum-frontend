/**
 * How current is the completion evidence?
 *
 * The Observatory previously rendered a static `CENSUS_DATE` next to its
 * percentages. That is worse than showing nothing: a stale percentage with a
 * confident date attached looks exactly like a current one, and the date only
 * says when someone last wrote the file — not whether the file still describes
 * the code that is running.
 *
 * So the graph declares the integration commit it was reconciled against, and
 * the running build declares its own commit (stamped into the page by
 * `vite.config.ts` -> `%OCU_RELEASE_SHA%`). Comparing the two is deterministic
 * and needs no network call.
 *
 * The important state is the third one. When the build stamp is absent or
 * `unattested` — a local build, a host that does not set it — we cannot tell
 * whether the evidence matches. That is `indeterminate`, and it must never
 * render as current. Not knowing is not the same as being up to date.
 */

/** Bounded freshness window. Past this the evidence is stale whatever the SHAs say. */
export const FRESHNESS_WINDOW_DAYS = 7;

export type EvidenceSnapshot = {
  /** Full git SHA of the integration commit this graph's evidence was checked against. */
  reconciledAgainstSha: string;
  /** When that reconciliation was performed. */
  reconciledAt: string;
  /** Short human note on the scope of the reconciliation. */
  scope: string;
};

export type FreshnessState = 'current' | 'drifted' | 'stale' | 'indeterminate';

export type FreshnessVerdict = {
  state: FreshnessState;
  /** Whole days between the reconciliation and the moment of evaluation; null if undatable. */
  ageDays: number | null;
  /** The build's own commit, or null when it did not attest one. */
  buildSha: string | null;
  snapshotSha: string;
  /** True only for `current` — the single state that may be presented as up to date. */
  presentAsCurrent: boolean;
  headline: string;
  detail: string;
};

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;

/** The build's commit, or null when it did not attest one. */
export function readBuildSha(doc?: Pick<Document, 'querySelector'>): string | null {
  const target = doc ?? (typeof document === 'undefined' ? null : document);
  if (!target) return null;
  const meta = target.querySelector('meta[name="ocu-release-sha"]');
  const content = meta?.getAttribute('content')?.trim().toLowerCase() ?? '';
  // `unattested` is the build's own honest placeholder, and the unreplaced
  // template token means the page was served without the stamp at all.
  if (!content || content === 'unattested' || content.includes('%')) return null;
  return FULL_GIT_SHA.test(content) ? content : null;
}

function ageInDays(reconciledAt: string, now: Date): number | null {
  const then = Date.parse(reconciledAt);
  if (Number.isNaN(then)) return null;
  const elapsed = now.getTime() - then;
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}

const shortSha = (sha: string | null) => (sha ? sha.slice(0, 7) : 'not attested');

/**
 * Judge the evidence.
 *
 * Ordering matters. The indeterminate check comes first because an unknown
 * build identity makes every other comparison unsound — without it, a page
 * served with no stamp would fall through to a date-only check and could
 * report `current` while running arbitrary code.
 */
export function assessFreshness(
  snapshot: EvidenceSnapshot,
  options: { buildSha?: string | null; now: Date; windowDays?: number },
): FreshnessVerdict {
  const windowDays = options.windowDays ?? FRESHNESS_WINDOW_DAYS;
  const buildSha = options.buildSha ?? null;
  const snapshotSha = snapshot.reconciledAgainstSha.trim().toLowerCase();
  const ageDays = ageInDays(snapshot.reconciledAt, options.now);

  const base = { ageDays, buildSha, snapshotSha };

  if (!buildSha || !FULL_GIT_SHA.test(snapshotSha)) {
    return {
      ...base,
      state: 'indeterminate',
      presentAsCurrent: false,
      headline: 'Freshness unverifiable',
      detail:
        'This build did not attest which commit it was built from, so the evidence below cannot be confirmed against the running code. Treat every percentage as unverified rather than current.',
    };
  }

  if (buildSha === snapshotSha) {
    // The only state that may be presented as up to date, and even then the
    // window still applies: evidence reconciled long ago against a commit that
    // happens to still be deployed has aged all the same.
    if (ageDays !== null && ageDays > windowDays) {
      return {
        ...base,
        state: 'stale',
        presentAsCurrent: false,
        headline: 'STALE — refresh required',
        detail: `Evidence was reconciled ${ageDays} days ago, beyond the ${windowDays}-day window, even though the build still matches commit ${shortSha(snapshotSha)}.`,
      };
    }
    return {
      ...base,
      state: 'current',
      presentAsCurrent: true,
      headline: 'Current',
      detail: `Evidence was reconciled against commit ${shortSha(snapshotSha)}, which is the commit this build was made from.`,
    };
  }

  if (ageDays !== null && ageDays > windowDays) {
    return {
      ...base,
      state: 'stale',
      presentAsCurrent: false,
      headline: 'STALE — refresh required',
      detail: `Evidence was reconciled ${ageDays} days ago against commit ${shortSha(snapshotSha)}; this build is commit ${shortSha(buildSha)}. Re-reconcile the graph before relying on these percentages.`,
    };
  }

  return {
    ...base,
    state: 'drifted',
    presentAsCurrent: false,
    headline: 'Build has moved past the evidence',
    detail: `Evidence was reconciled against commit ${shortSha(snapshotSha)}; this build is commit ${shortSha(buildSha)}. Work landed since then is not reflected below.`,
  };
}
