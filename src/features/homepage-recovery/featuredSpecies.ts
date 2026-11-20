import { publicGenusMediaItems, isInaturalistPhotographUrl, type GenusMediaItem } from '@/lib/genusMediaResolver';
import { displayScientificName, normalizedMediaKey, normalizedTaxonKey } from '@/lib/genusProfileDataQuality';

/** One photograph per named species, with source identity retained verbatim.
 * The two excluded hosts supplied herbarium sheets in the captured public
 * Masdevallia response (2026-11-20), despite its photograph label.
 */
export function featuredSpecies(items: GenusMediaItem[], genus: string): GenusMediaItem[] {
  const taxa = new Set<string>();
  const photos = new Set<string>();
  return publicGenusMediaItems(items).filter(item => typeof item.genus === 'string' && item.genus.toLowerCase() === genus.toLowerCase()
    && displayScientificName(item.scientific_name).split(' ')[0].toLowerCase() === genus.toLowerCase()
    && displayScientificName(item.scientific_name).includes(' ')
    && !['sweetgum.nybg.org', 'd2jcv3kl45hlgi.cloudfront.net'].includes(new URL(item.image_url).hostname))
    .sort((a, b) => Number(Boolean(b.attribution?.trim())) - Number(Boolean(a.attribution?.trim()))
      || Number(isInaturalistPhotographUrl(b.image_url)) - Number(isInaturalistPhotographUrl(a.image_url)))
    .filter(item => {
      const taxon = normalizedTaxonKey(item.scientific_name), photo = normalizedMediaKey(item.image_url);
      if (!photo || taxa.has(taxon) || photos.has(photo)) return false;
      taxa.add(taxon); photos.add(photo); return true;
    });
}

