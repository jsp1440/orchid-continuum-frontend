import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every navigation destination must be a mounted route, and every route a
 * visitor is meant to find must be reachable from navigation.
 *
 * Both halves have failed here before. A route mounted with nothing linking to
 * it is a capability nobody can find; a link to a path with no route is a
 * visitor dropped on NotFound. Neither shows up in a unit test of either side
 * on its own, because each half is internally correct.
 *
 * This reads App.tsx and the navigation sources as text rather than mounting
 * the app. Mounting the whole router to enumerate routes pulls in every page
 * and its data layer, which makes the guard slower and more fragile than the
 * thing it guards.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

const APP = read('App.tsx');
const NAVBAR = read('components/orchid/Navbar.tsx');
const FOOTER = read('components/orchid/Footer.tsx');

/** Route patterns declared in App.tsx, minus the catch-all. */
const ROUTES = [...APP.matchAll(/path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((route) => route !== '*');

function isMounted(path: string): boolean {
  return ROUTES.some((route) => {
    const pattern =
      '^' +
      route
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/:[^/]+/g, '[^/]+')
        .replace(/\/\*$/, '(/.*)?') +
      '$';
    return new RegExp(pattern).test(path);
  });
}

/** Internal destinations declared as data in a navigation source. */
function navigationRoutes(source: string): string[] {
  return [...source.matchAll(/route:\s*'(\/[^']*)'/g)].map((match) => match[1]);
}

const NAV_ROUTES = [...new Set([...navigationRoutes(NAVBAR), ...navigationRoutes(FOOTER)])];

describe('navigation reachability', () => {
  it('found the navigation sources it is meant to be checking', () => {
    // A guard that silently matches nothing passes forever. If the navigation
    // is restructured so `route:` entries disappear, this fails rather than
    // quietly stopping work.
    expect(NAV_ROUTES.length).toBeGreaterThan(15);
    expect(ROUTES.length).toBeGreaterThan(50);
  });

  it('points every navigation entry at a mounted route', () => {
    const dead = NAV_ROUTES.filter((route) => !isMounted(route));
    expect(dead, `navigation links with no route: ${dead.join(', ')}`).toEqual([]);
  });

  it('keeps the recovered workspaces reachable', () => {
    // Both were mounted and linked from nowhere when they landed. A route a
    // visitor cannot find is a dead end of its own kind.
    expect(NAV_ROUTES).toContain('/education/judging-practice');
    expect(NAV_ROUTES).toContain('/culture/orchids-on-screen');
  });

  it('keeps the governed journey entry points reachable', () => {
    // The surfaces the Continuum journey starts from. If one drops out of
    // navigation the journey still works but nobody enters it.
    for (const entry of ['/atlas', '/species', '/calyx', '/research', '/lexicon', '/classroom']) {
      expect(NAV_ROUTES, `${entry} is not linked from navigation`).toContain(entry);
    }
  });
});

describe('route pattern matching', () => {
  it('recognises a parameterised route', () => {
    // Guards the matcher itself — a matcher that accepted everything would
    // make the test above vacuous.
    expect(isMounted('/species/cattleya-purpurata')).toBe(true);
    expect(isMounted('/atlas/ecuador')).toBe(true);
  });

  it('recognises a splat route and its children', () => {
    expect(isMounted('/lexicon')).toBe(true);
    expect(isMounted('/lexicon/browse')).toBe(true);
  });

  it('rejects a path with no route', () => {
    expect(isMounted('/definitely-not-a-route')).toBe(false);
    expect(isMounted('/education/no-such-lab')).toBe(false);
  });
});
