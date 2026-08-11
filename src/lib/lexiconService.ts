import { entries as famousFallback } from '@/data/lexiconEntries';
import type {
  LexiconAsset,
  LexiconCategory,
  LexiconEntry,
  LexiconStats,
  LiteratureRecord,
  Relationship,
  ReviewState,
  TaxonLink,
} from '@/data/types';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export const LEXICON_API_BASE = '/api/lexicon';
export type LexiconSource = 'canonical' | 'famous_fallback' | 'canonical_plus_famous_fallback';

let lastSource: LexiconSource = 'famous_fallback';
export const getLastSource = (): LexiconSource => lastSource;

export interface CanonicalLexiconEnvelope {
  release: string;
  count: number;
  entries: LexiconEntry[];
  source_of_truth?: string;
  automatic_publication?: boolean;
  visibility?: string;
}

export type CanonicalLexiconResponse = CanonicalLexiconEnvelope;

function normalizeEntry(entry: LexiconEntry): LexiconEntry {
  return {
    ...entry,
    maturity: entry.maturity ?? [],
    review_state: entry.review_state ?? 'draft',
    assets: entry.assets ?? [],
    literature: entry.literature ?? [],
    relationships: entry.relationships ?? [],
    character_states: entry.character_states ?? [],
    example_taxa: entry.example_taxa ?? [],
    definition_versions: entry.definition_versions ?? [],
  };
}

function mergeBySlug(fallback: LexiconEntry[], canonical: LexiconEntry[]): LexiconEntry[] {
  const merged = new Map<string, LexiconEntry>();
  fallback.forEach((entry) => merged.set(entry.slug, normalizeEntry(entry)));
  canonical.forEach((entry) => {
    const prior = merged.get(entry.slug);
    merged.set(entry.slug, normalizeEntry({ ...prior, ...entry, provenance: entry.provenance ?? prior?.provenance }));
  });
  return [...merged.values()].sort((a, b) => a.preferred_term.localeCompare(b.preferred_term));
}

export function mergeCanonicalAndFallback(canonical: LexiconEntry[], fallback: LexiconEntry[]): LexiconEntry[] {
  return mergeBySlug(fallback, canonical);
}

async function requestCanonical(path = ''): Promise<CanonicalLexiconEnvelope> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${LEXICON_API_BASE}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Canonical lexicon API ${response.status}`);
  return response.json() as Promise<CanonicalLexiconEnvelope>;
}

export async function getEntries(): Promise<LexiconEntry[]> {
  try {
    const payload = await requestCanonical('?limit=2000');
    const canonical = (payload.entries ?? []).map(normalizeEntry);
    if (!canonical.length) {
      lastSource = 'famous_fallback';
      return famousFallback.map(normalizeEntry);
    }
    lastSource = 'canonical_plus_famous_fallback';
    return mergeBySlug(famousFallback, canonical);
  } catch {
    lastSource = 'famous_fallback';
    return famousFallback.map(normalizeEntry);
  }
}

export async function getEntry(slug: string): Promise<LexiconEntry | undefined> {
  const entries = await getEntries();
  return entries.find((entry) => entry.slug === slug);
}

export async function searchEntries(q: string): Promise<LexiconEntry[]> {
  const needle = q.trim().toLocaleLowerCase();
  if (!needle) return getEntries();
  try {
    const payload = await requestCanonical(`/search?q=${encodeURIComponent(q)}&limit=200`);
    const canonical = (payload.entries ?? []).map(normalizeEntry);
    const localMatches = famousFallback.filter((entry) =>
      [entry.preferred_term, entry.quick_definition ?? '', ...(entry.synonyms ?? [])]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle),
    );
    lastSource = canonical.length ? 'canonical_plus_famous_fallback' : 'famous_fallback';
    return mergeBySlug(localMatches, canonical);
  } catch {
    const all = famousFallback.map(normalizeEntry);
    lastSource = 'famous_fallback';
    return all.filter((entry) =>
      [entry.preferred_term, entry.quick_definition ?? '', ...(entry.synonyms ?? [])]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle),
    );
  }
}

export async function getEntriesByCategory(category: string): Promise<LexiconEntry[]> {
  return (await getEntries()).filter((entry) => entry.category === category);
}

async function subresource<T>(slug: string, field: keyof LexiconEntry): Promise<T[]> {
  const entry = await getEntry(slug);
  const value = entry?.[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

export const getLiterature = (slug: string) => subresource<LiteratureRecord>(slug, 'literature');
export const getTaxa = (slug: string) => subresource<TaxonLink>(slug, 'example_taxa');
export const getImages = (slug: string) => subresource<LexiconAsset>(slug, 'assets');
export const getRelationships = (slug: string) => subresource<Relationship>(slug, 'relationships');

export interface SaveResult {
  ok: boolean;
  error?: string;
}

const writeBlocked = (): SaveResult => ({
  ok: false,
  error: 'Canonical lexicon writes require the governed Concept Registry/review workflow; legacy Famous Supabase writes are disabled.',
});

export async function importEntries(_entries: LexiconEntry[]): Promise<{ ok: boolean; count: number; error?: string }> {
  const blocked = writeBlocked();
  return { ...blocked, count: 0 };
}

export async function saveEntry(_entry: LexiconEntry): Promise<SaveResult> {
  return writeBlocked();
}

export async function setReviewState(_slug: string, _state: ReviewState): Promise<SaveResult> {
  return writeBlocked();
}

export async function deleteEntry(_slug: string): Promise<SaveResult> {
  return writeBlocked();
}

export async function getAssetCatalogue(): Promise<LexiconAsset[]> {
  return (await getEntries()).flatMap((entry) => entry.assets ?? []);
}

export async function saveAssets(_assets: LexiconAsset[]): Promise<SaveResult> {
  return writeBlocked();
}

export function attachCatalogue(entries: LexiconEntry[], catalogue: LexiconAsset[]): LexiconEntry[] {
  const bySlug = new Map<string, LexiconAsset[]>();
  catalogue.forEach((asset) => {
    (asset.illustrates ?? []).forEach((slug) => {
      const list = bySlug.get(slug) ?? [];
      list.push(asset);
      bySlug.set(slug, list);
    });
  });
  return entries.map((entry) => ({ ...entry, assets: [...(entry.assets ?? []), ...(bySlug.get(entry.slug) ?? [])] }));
}

export interface StoredDraft {
  slug: string;
  saved_at: string;
  entry: LexiconEntry;
}

const draftKey = (slug: string) => `oc-lexicon-draft:${slug}`;

export function saveDraftLocally(entry: LexiconEntry): StoredDraft | null {
  if (typeof window === 'undefined') return null;
  const draft = { slug: entry.slug, saved_at: new Date().toISOString(), entry };
  window.localStorage.setItem(draftKey(entry.slug), JSON.stringify(draft));
  return draft;
}

export function loadDraftLocally(slug: string): StoredDraft | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(draftKey(slug));
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredDraft; } catch { return null; }
}

export function clearDraftLocally(slug: string): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(draftKey(slug));
}

export function listLocalDrafts(): StoredDraft[] {
  if (typeof window === 'undefined') return [];
  const drafts: StoredDraft[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith('oc-lexicon-draft:')) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try { drafts.push(JSON.parse(raw) as StoredDraft); } catch { /* ignore corrupt local draft */ }
  }
  return drafts.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

export function computeStats(list: LexiconEntry[]): LexiconStats {
  return {
    total_entries: list.length,
    illustrated_entries: list.filter((entry) => (entry.assets ?? []).length > 0).length,
    enriched_entries: list.filter((entry) => (entry.maturity ?? []).includes('scientifically_enriched')).length,
    literature_linked_entries: list.filter((entry) => (entry.literature ?? []).length > 0 || (entry.maturity ?? []).includes('literature_linked')).length,
    taxonomy_linked_entries: list.filter((entry) => (entry.example_taxa ?? []).length > 0 || (entry.maturity ?? []).includes('taxonomy_linked')).length,
    expert_reviewed_entries: list.filter((entry) => (entry.maturity ?? []).includes('expert_reviewed') || entry.review_state === 'expert_reviewed' || entry.review_state === 'published').length,
    categories: new Set(list.map((entry) => entry.category).filter(Boolean)).size,
  };
}

export function getCategories(list: LexiconEntry[]): string[] {
  return [...new Set(list.map((entry) => entry.category).filter((value): value is LexiconCategory => Boolean(value)))].sort();
}

export function groupByLetter(list: LexiconEntry[]): Record<string, LexiconEntry[]> {
  return list.reduce<Record<string, LexiconEntry[]>>((groups, entry) => {
    const key = entry.preferred_term.charAt(0).toUpperCase() || '#';
    (groups[key] ??= []).push(entry);
    return groups;
  }, {});
}

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const CATEGORY_OPTIONS: LexiconCategory[] = [
  'Floral Morphology', 'Vegetative Morphology', 'Anatomy', 'Development', 'Physiology',
  'Pollination Biology', 'Ecology', 'Evolution', 'Taxonomy', 'Nomenclature', 'Botanical Latin',
  'Orchid Culture', 'Reproductive Biology', 'Mycorrhizal Biology', 'Conservation Terminology',
];

export function slugify(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function emptyEntry(): LexiconEntry {
  return {
    id: `draft-${Date.now()}`,
    slug: '',
    preferred_term: '',
    maturity: [],
    review_state: 'draft',
    source_system: 'Orchid Continuum Lexicon authoring draft',
  };
}
