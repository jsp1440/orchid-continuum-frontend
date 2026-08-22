import { describe, expect, it } from 'vitest';

import { parseRoute } from './lexiconRoute';
import { researchStationLexiconHref } from '@/lib/researchStationNavigation';

/**
 * The Lexicon is the last module in the Research Station's fan-out, and it was
 * the one that dropped the subject.
 *
 * researchStationLexiconHref hands the investigation's taxon to the section
 * root as `?q=`. parseRoute read `q` only under `/lexicon/browse`, so the
 * handoff resolved to the home view and the term vanished — no error, no empty
 * result, just a front door. The Footer's Glossary link has the same shape.
 *
 * These tests run the real builder against the real parser rather than
 * asserting on a hand-written URL, so the two cannot drift apart.
 */

const SPECIES = 'Cattleya purpurata';

/** Split a built href the way the router hands it to parseRoute. */
function routeOf(href: string) {
  const index = href.indexOf('?');
  const pathname = index === -1 ? href : href.slice(0, index);
  const search = index === -1 ? '' : href.slice(index);
  return parseRoute(pathname, search);
}

describe('lexicon receives the subject handed to it', () => {
  it('opens the browser on the term the Research Station sent', () => {
    const route = routeOf(researchStationLexiconHref({ taxon: SPECIES, projectId: 'p-1' }));
    expect(route.view).toBe('lexicon');
    expect(route.query).toBe(SPECIES);
  });

  it('still shows the home view when the section root carries no term', () => {
    // The Footer's plain Glossary link, and anyone browsing in directly.
    expect(parseRoute('/lexicon', '')).toEqual({ view: 'home' });
    expect(parseRoute('/lexicon/', '')).toEqual({ view: 'home' });
  });

  it('treats a blank term as no term rather than an empty search', () => {
    expect(parseRoute('/lexicon', '?q=').view).toBe('home');
    expect(parseRoute('/lexicon', '?q=%20%20').view).toBe('home');
  });

  it('leaves every other section unchanged', () => {
    // A `q` on a section that is not a search must not hijack it.
    expect(parseRoute('/lexicon/about', '?q=orchid').view).toBe('about');
    expect(parseRoute('/lexicon/collection', '?q=orchid').view).toBe('collection');
    expect(parseRoute('/lexicon/partners', '')).toEqual({ view: 'partners' });
    expect(parseRoute('/lexicon/validation', '')).toEqual({ view: 'validation' });
    expect(parseRoute('/lexicon/browse', '?q=orchid')).toEqual({
      view: 'lexicon',
      query: 'orchid',
    });
    expect(parseRoute('/lexicon/entry/resupination', '')).toEqual({
      view: 'entry',
      slug: 'resupination',
    });
  });

  it('carries no locality out of the research context', () => {
    const href = researchStationLexiconHref({ taxon: SPECIES, projectId: 'p-1' });
    const keys = [...new URLSearchParams(href.slice(href.indexOf('?'))).keys()];
    expect(keys).not.toContain('locality');
    expect(keys).not.toContain('lat');
    expect(keys).not.toContain('coordinates');
  });
});
