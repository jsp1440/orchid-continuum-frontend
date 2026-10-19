/**
 * Public species record hydration for the dossier page.
 *
 * The public API has no `GET /api/species/{id}` detail endpoint (it 404s), so
 * `fetchSpeciesById` returns null for every visitor and the dossier's public
 * record blocks (name, taxonomy, image, conservation) render empty. The
 * verified `/api/species/search` index exposes the same record fields for the
 * same taxonomy-id space, so when the detail endpoint misses we recover the
 * row whose `taxonomy_id` exactly matches the route id — never a name-only
 * guess at a different record.
 *
 * Nothing here invents data: every returned field is copied verbatim from the
 * public index row. When the index has no row for the id, the function
 * resolves to null and the page keeps its existing honest empty states.
 */
import {
  fetchSpeciesById,
  searchSpecies,
  type SpeciesDossierData,
} from '@/lib/ocBackend';
import { subjectNameFromSlug } from '@/lib/speciesDossier';

export async function fetchSpeciesPublicRecord(
  taxonomyId: string,
  hintName: string | null,
  signal?: AbortSignal,
): Promise<SpeciesDossierData | null> {
  const direct = await fetchSpeciesById(taxonomyId, signal).catch(() => null);
  if (direct) return direct;

  const query = (hintName || subjectNameFromSlug(taxonomyId) || '').trim();
  if (!query) return null;

  const results = await searchSpecies(query, 10, signal).catch(() => []);
  const hit = results.find(
    (row) => String(row.taxonomy_id) === String(taxonomyId),
  );
  if (!hit) return null;

  return {
    taxonomy_id: String(hit.taxonomy_id),
    canonical_name: hit.canonical_name,
    scientific_name: hit.scientific_name,
    genus: hit.genus,
    family: hit.family,
    conservation_status: hit.conservation_status,
    ...extractRecordFields(hit as unknown as Record<string, unknown>),
  };
}

/**
 * The search endpoint returns richer fields than its TypeScript surface
 * declares; pass through only the ones SpeciesDossierData models, verbatim.
 */
function extractRecordFields(
  row: Record<string, unknown>,
): Partial<SpeciesDossierData> {
  const text = (key: keyof SpeciesDossierData) => {
    const value = row[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  return {
    specific_epithet: text('specific_epithet'),
    common_name: text('common_name'),
    region: text('region'),
    habitat: text('habitat'),
    representative_image_url: text('representative_image_url'),
  };
}
