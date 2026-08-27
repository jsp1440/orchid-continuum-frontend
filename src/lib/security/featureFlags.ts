/**
 * Security-subsystem feature flags.
 *
 * New ENFORCEMENT behavior is gated. Per the directive, the first release
 * defaults to observation + explanation + warning, NOT automatic blocking. Set
 * VITE_SECURITY_ENFORCE=true only after a governed review.
 *
 * Flags default conservatively:
 *  - the Trust Center surface is OFF unless explicitly enabled;
 *  - enforcement is OFF (deny decisions surface as warnings, not hard blocks);
 *  - domain posture is OFF until selectors/domains are configured.
 */

function flag(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const v = String(raw).toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

// Read import.meta.env directly (not via an aliased object) so build-time
// replacement and test-time vi.stubEnv both apply — matching the pattern used
// elsewhere in the codebase (e.g. ConservatoryReadiness).
export const SECURITY_FLAGS = {
  /** Master switch for the Security/Trust Center UI surface. */
  trustCenter: flag(import.meta.env.VITE_SECURITY_TRUST_CENTER, false),
  /** When true, policy denials hard-block; when false, they surface as warnings. */
  enforce: flag(import.meta.env.VITE_SECURITY_ENFORCE, false),
  /** Domain posture surface (needs configured domains/selectors). */
  domainPosture: flag(import.meta.env.VITE_SECURITY_DOMAIN_POSTURE, false),
} as const;

export type SecurityFlagKey = keyof typeof SECURITY_FLAGS;
