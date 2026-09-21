/**
 * Operator-facing warning for an unconfigured public API origin.
 *
 * Visitors used to be shown the literal string "VITE_API_BASE_URL" in the
 * widget body when the origin was unset. Build-configuration vocabulary means
 * nothing to a visitor and reads as a broken page; the person who can act on
 * it is reading the console, not the gallery. So the visitor gets plain
 * language and the operator gets the variable name, once per session.
 */

let warned = false;

export function warnApiUnconfigured(surface: string): void {
  if (warned) return;
  warned = true;
  console.warn(
    `[orchid-continuum] ${surface}: live data is unavailable because ` +
      'VITE_API_BASE_URL is not set for this deployment. See .env.example.',
  );
}

/** Test seam: forget that the warning was already emitted. */
export function resetApiUnconfiguredWarning(): void {
  warned = false;
}
