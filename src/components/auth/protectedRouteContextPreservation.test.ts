import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

/**
 * The auth gate must not eat the subject.
 *
 * Every governed handoff into Research — Species Dossier, Atlas Next, Matrix,
 * featured taxon — carries its subject in the query string, and `/research` is
 * wrapped in ProtectedRoute. So the gate sits directly on the journey.
 *
 * ProtectedRoute currently opens the sign-in modal in place and re-renders the
 * children once a session exists. The URL never changes, so the subject
 * survives. Rewriting it to redirect to a login route — the obvious-looking
 * refactor — would silently drop the query string and every handoff would land
 * a signed-in visitor on an empty Research Center with no error anywhere.
 *
 * That failure is invisible: the page still works, it just forgets what the
 * visitor was studying. This pins the property so the refactor fails loudly.
 */

const PROTECTED_ROUTE = 'components/auth/ProtectedRoute.tsx';

describe('protected route preserves handoff context', () => {
  it('gates in place rather than redirecting away from the deep link', () => {
    const text = source(PROTECTED_ROUTE);
    // A redirect is what would discard the query string.
    expect(text).not.toMatch(/<Navigate\b/);
    expect(text).not.toMatch(/useNavigate\s*\(/);
    expect(text).not.toMatch(/window\.location\.(assign|replace|href\s*=)/);
    // The in-place mechanism that keeps the URL intact.
    expect(text).toContain('AuthModal');
  });

  it('renders the gated page itself once a session exists', () => {
    // If the authenticated branch stopped rendering children, the handoff would
    // arrive nowhere even with the URL preserved.
    expect(source(PROTECTED_ROUTE)).toContain('{children}');
  });

  it('keeps Research behind the gate that preserves context', () => {
    // Ties the guarantee to the route that actually receives the handoffs: if
    // /research is ever moved to a different gate, this test must be revisited
    // rather than silently passing on ProtectedRoute's behaviour alone.
    const app = source('App.tsx');
    expect(app).toMatch(/path="\/research"[\s\S]{0,200}ProtectedRoute/);
  });
});
