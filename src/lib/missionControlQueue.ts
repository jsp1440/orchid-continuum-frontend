/**
 * Read a display-only command state off a queue item, whatever shape it is.
 *
 * The queue renders either live backend items or a static fallback, and only
 * the backend branch carries `commandState`. `'commandState' in item` looks
 * like the way to tell them apart, but on a union whose other member lacks the
 * key TypeScript narrows that member to `... & Record<'commandState', unknown>`,
 * so the property reads as `unknown` and cannot be rendered (TS2322).
 *
 * This is genuine feature detection across two different shapes, so it is
 * settled at runtime rather than asserted away: an item that does not supply a
 * string simply has no command state to show.
 */
export function commandStateOf(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const value = (item as Record<string, unknown>).commandState;
  return typeof value === 'string' && value.trim() ? value : null;
}

