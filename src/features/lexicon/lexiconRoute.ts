import type { ViewKey } from '@/components/lexicon/SiteChrome';

export interface RouteState {
  view: ViewKey;
  slug?: string;
  query?: string;
}

/**
 * Resolve a Lexicon URL to a view.
 *
 * `/lexicon?q=…` resolves to the browser, not the home page. The Research
 * Station hands the investigation's subject to the Lexicon as a `q` on the
 * section root (`researchStationLexiconHref`), and the Footer's Glossary link
 * points at that same root. Reading `q` only under `/browse` meant the handoff
 * landed on the home page with the term silently discarded — the visitor asked
 * about a term and got a front door, with nothing indicating a search had been
 * requested at all.
 *
 * A root URL carrying a search term means search. This is the same resolution
 * HomeView's own search box performs via `onSearch`; it just also happens when
 * the term arrives from outside the Lexicon.
 */
export function parseRoute(pathname: string, search: string): RouteState {
  const path = pathname.replace(/^\/lexicon\/?/, '');
  const parts = path.split('/').filter(Boolean);
  const rawQuery = new URLSearchParams(search).get('q')?.trim();
  const query = rawQuery ? rawQuery : undefined;
  if (parts[0] === 'entry' && parts[1]) return { view: 'entry', slug: decodeURIComponent(parts[1]) };
  if (parts[0] === 'browse' || parts[0] === 'a-z') return { view: 'lexicon', query };
  if (parts[0] === 'collection') return { view: 'collection' };
  if (parts[0] === 'partners') return { view: 'partners' };
  if (parts[0] === 'about') return { view: 'about' };
  if (parts[0] === 'validation') return { view: 'validation' };
  if (!parts.length && query) return { view: 'lexicon', query };
  return { view: 'home' };
}
