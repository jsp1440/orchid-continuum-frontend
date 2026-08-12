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

export interface CanonicalLexiconEntryEnvelope {
  release: string;
  entry: LexiconEntry;
  source_of_truth?: string;
  automatic_publication?: boolean;
  visibility?: string;
}

export type CanonicalLexiconResponse = CanonicalLexiconEnvelope;

const VALID_REVIEW_STATES: ReviewState[] = [
  'draft',
  'source_imported',
  'literature_reviewed',
  'illustration_reviewed',
  'expert_reviewed',
  'published',
  'revision_needed',
];

function normalizeReviewState(value: unknown): ReviewState {
  const state = String(value ?? '').trim().toLocaleLowerCase();
  if (state === 'approved') return 'expert_reviewed';
  return VALID_REVIEW_STATES.includes(state as ReviewState) ? (state as ReviewState) : 'draft';
}

function normalizeEntry(entry: LexiconEntry): LexiconEntry {
  return {
    ...entry,
    maturity: entry.maturity ?? [],
    review_state: normalizeReviewState(entry.review_state),
    assets: entry.assets ?? [],
    literature: entry.literature ?? [],
    relationships: entry.relationships ?? [],
    character_states: entry.character_states ?? [],
    example_taxa: entry.example_taxa ?? [],
    definition_versions: entry.definition_versions ?? [],
  };
}

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasContent);
  return true;
}

const FAMOUS_OVERLAY_FIELDS: Array<keyof LexiconEntry> = [
  'pronunciation',
  'category',
  'subcategory',
  'scope_note',
  'synonyms',
  'related_terminology',
  'contrasting_terms',
  'broader_concept',
  'narrower_concepts',
  'etymology',
  'anatomical_context',
  'morphological_context',
  'mechanism_blocks',
  'significance_blocks',
  'evolution_blocks',
  'variation_notes',
  'character_states',
  'example_taxa',
  'identification_significance',
  'identification_cautions',
  'identification_companion_characters',
  'conservation',
  'assets',
  'research_questions',
  'literature',
  'literature_status',
  'relationships',
  'calyx_notes',
  'vision_lab_notes',
  'funding',
];

/**
 * Canonical Concept Registry science remains authoritative. The migrated Famous
 * build may fill presentation/enrichment fields that have not yet migrated to
 * canonical storage, but those fields are explicitly recorded as an overlay.
 * Scientific definitions and maturity/capability state are never supplied by
 * the migration overlay.
 */
function mergeCanonicalEntry(fallback: LexiconEntry | undefined, canonical: LexiconEntry): LexiconEntry {
  const reviewed = normalizeEntry(canonical);
  if (!fallback) return reviewed;

  const migrated = normalizeEntry(fallback);
  const merged = { ...migrated, ...reviewed } as LexiconEntry;
  const overlayFields: string[] = [];
  const reviewedRecord = reviewed as unknown as Record<string, unknown>;
  const migratedRecord = migrated as unknown as Record<string, unknown>;
  const mergedRecord = merged as unknown as Record<string, unknown>;

  for (const field of FAMOUS_OVERLAY_FIELDS) {
    if (!hasContent(reviewedRecord[field as string]) && hasContent(migratedRecord[field as string])) {
      mergedRecord[field as string] = migratedRecord[field as string];
      overlayFields.push(field as string);
    }
  }

  // These are governed scientific/capability fields. A canonical concept with
  // no reviewed value remains explicitly incomplete rather than inheriting
  // migration prose or capability flags.
  merged.quick_definition = reviewed.quick_definition;
  merged.expanded_definition = reviewed.expanded_definition;
  merged.definition_versions = reviewed.definition_versions;
  merged.maturity = reviewed.maturity;

  merged.id = reviewed.id;
  merged.concept_id = reviewed.concept_id ?? reviewed.id;
  merged.concept_uri = reviewed.concept_uri;
  merged.slug = reviewed.slug;
  merged.preferred_term = reviewed.preferred_term;
  merged.review_state = reviewed.review_state;
  merged.provenance = reviewed.provenance;
  merged.source_system = reviewed.source_system ?? 'oc_concepts';
  merged.source_record_id = reviewed.source_record_id ?? reviewed.id;
  merged.date_created = reviewed.date_created;
  merged.date_revised = reviewed.date_revised;

  if (overlayFields.length) {
    merged.migration_overlay = {
      source_system: 'Famous AI Illustrated Orchid Lexicon migration',
      fields: [...new Set(overlayFields)].sort(),
    };
  } else {
    delete merged.migration_overlay;
  }
  return normalizeEntry(merged);
}

function mergeBySlug(fallback: LexiconEntry[], canonical: LexiconEntry[]): LexiconEntry[] {
  const fallbackBySlug = new Map(fallback.map((entry) => [entry.slug, normalizeEntry(entry)]));
  const merged = new Map<string, LexiconEntry>();
  fallbackBySlug.forEach((entry, slug) => merged.set(slug, entry));
  canonical.forEach((entry) => merged.set(entry.slug, mergeCanonicalEntry(fallbackBySlug.get(entry.slug), entry)));
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

async function requestCanonicalEntry(slug: string): Promise<CanonicalLexiconEntryEnvelope> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${LEXICON_API_BASE}/entries/${encodeURIComponent(slug)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Canonical lexicon entry API ${response.status}`);
  return response.json() as Promise<CanonicalLexiconEntryEnvelope>;
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
  const normalizedSlug = slug.trim().toLocaleLowerCase();
  const fallback = famousFallback.find((entry) => entry.slug === normalizedSlug);

  try {
    const payload = await requestCanonicalEntry(normalizedSlug);
    lastSource = fallback ? 'canonical_plus_famous_fallback' : 'canonical';
    return mergeCanonicalEntry(fallback, payload.entry);
  } catch {
    // Supports a staggered deployment where the frontend lands before the new
    // direct-entry backend route. Canonical search is tried before static fallback.
    try {
      const payload = await requestCanonical(`/search?q=${encodeURIComponent(normalizedSlug.replace(/-/g, ' '))}&limit=50`);
      const canonical = (payload.entries ?? []).map(normalizeEntry).find((entry) => entry.slug === normalizedSlug);
      if (canonical) {
        lastSource = fallback ? 'canonical_plus_famous_fallback' : 'canonical';
        return mergeCanonicalEntry(fallback, canonical);
      }
    } catch {
      // The static migration remains read-only resilience, never write authority.
    }
    lastSource = 'famous_fallback';
    return fallback ? normalizeEntry(fallback) : undefined;
  }
}

export async function searchEntries(q: string): Promise<LexiconEntry[]> {
  const needle = q.trim().toLocaleLowerCase();
  if (!needle) return getEntries();
  try {
    const payload = await requestCanonical(`/search?q=${encodeURIComponent(q)}&limit=200`);
    const canonical = (payload.entries ?? []).map(normalizeEntry);
    const localMatches = famousFallback.filter((entry) =>
      [entry.preferred_term, entry.quick_definition ?? '', entry.expanded_definition ?? '', ...(entry.synonyms ?? [])]
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
      [entry.preferred_term, entry.quick_definition ?? '', entry.expanded_definition ?? '', ...(entry.synonyms ?? [])]
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
