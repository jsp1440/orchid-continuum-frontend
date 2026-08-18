import { describe, expect, it } from 'vitest';
import { creditLine, heroStateFromResponse, selectHeroMedia } from '@/lib/heroMedia';
import type { GenusMediaItem, GenusMediaResponse } from '@/lib/genusMediaResolver';

function item(overrides: Partial<GenusMediaItem> = {}): GenusMediaItem {
  return {
    media_id: 'm1',
    taxon_id: null,
    scientific_name: 'Dracula vespertilio',
    genus: 'Dracula',
    image_url: 'https://media.example.test/a.jpg',
    thumbnail_url: 'https://media.example.test/a-thumb.jpg',
    source_name: 'Orchid Continuum media library',
    source_record_url: null,
    license: 'CC BY 4.0',
    attribution: 'A. Photographer',
    media_kind: 'photograph',
    quality_score: null,
    ...overrides,
  };
}

function response(overrides: Partial<GenusMediaResponse> = {}): GenusMediaResponse {
  return {
    status: 'ok',
    requested_genus: 'Dracula',
    accepted_genus: 'Dracula',
    generated_at: null,
    items: [],
    summary: { eligible_count: 0, returned_count: 0, exclusion_counts: {} },
    ...overrides,
  };
}

describe('selectHeroMedia', () => {
  it('returns null for an empty list', () => {
    expect(selectHeroMedia([])).toBeNull();
  });

  it('prefers the highest quality score', () => {
    const chosen = selectHeroMedia([
      item({ media_id: 'low', quality_score: 0.2 }),
      item({ media_id: 'high', quality_score: 0.9 }),
      item({ media_id: 'mid', quality_score: 0.5 }),
    ]);
    expect(chosen?.media_id).toBe('high');
  });

  it('keeps backend order when no item is scored', () => {
    const chosen = selectHeroMedia([item({ media_id: 'first' }), item({ media_id: 'second' })]);
    expect(chosen?.media_id).toBe('first');
  });

  it('is deterministic across repeated calls', () => {
    const items = [
      item({ media_id: 'a', quality_score: 0.7 }),
      item({ media_id: 'b', quality_score: 0.7 }),
    ];
    expect(selectHeroMedia(items)?.media_id).toBe(selectHeroMedia(items)?.media_id);
  });
});

describe('heroStateFromResponse', () => {
  it('shows a photograph when approved media exists', () => {
    const state = heroStateFromResponse(response({ items: [item()] }));
    expect(state.kind).toBe('photograph');
  });

  it('distinguishes an empty archive from an outage', () => {
    expect(heroStateFromResponse(response({ status: 'no_approved_media' })).kind).toBe(
      'no_approved_media',
    );
    expect(heroStateFromResponse(response({ status: 'service_error' })).kind).toBe('service_error');
  });

  it('reports an ok response with no items as no approved media, not as an error', () => {
    expect(heroStateFromResponse(response({ status: 'ok', items: [] })).kind).toBe(
      'no_approved_media',
    );
  });

  it('treats an invalid genus as our fault rather than an empty archive', () => {
    expect(heroStateFromResponse(response({ status: 'invalid_genus' })).kind).toBe('service_error');
  });
});

describe('creditLine', () => {
  it('joins attribution and license', () => {
    expect(creditLine(item())).toBe('A. Photographer · CC BY 4.0');
  });

  it('falls back to the source when there is no attribution', () => {
    expect(creditLine(item({ attribution: null }))).toBe(
      'Orchid Continuum media library · CC BY 4.0',
    );
  });

  it('returns null when the record carries no credit at all', () => {
    expect(creditLine(item({ attribution: null, source_name: '', license: null }))).toBeNull();
  });
});
