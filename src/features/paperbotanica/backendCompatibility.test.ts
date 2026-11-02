import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { fetchPaperBotanicaCollection, fetchPaperBotanicaProfile } from './api';

/** Optional exact-backend fixture, produced by the backend artifact audit.
 * Omitted input is a skip, never a compatibility PASS. */
const fixturePath = process.env.PAPERBOTANICA_API_FIXTURE;
it.skipIf(!fixturePath)('accepts actual collection and every exact-backend profile response', async () => {
  const fixture = JSON.parse(readFileSync(fixturePath!, 'utf8'));
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  try {
    fetcher.mockResolvedValue(new Response(JSON.stringify(fixture.collection)));
    const collection = await fetchPaperBotanicaCollection();
    expect(collection.species_count).toBe(8);
    for (const species of collection.species) {
      expect(fixture.profiles[species.species_id]).toBeDefined();
      fetcher.mockResolvedValue(new Response(JSON.stringify(fixture.profiles[species.species_id])));
      await expect(fetchPaperBotanicaProfile(species.species_id)).resolves.toMatchObject({species_id:species.species_id});
    }
  } finally { vi.unstubAllGlobals(); }
});
