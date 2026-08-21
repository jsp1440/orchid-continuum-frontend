import { describe, expect, it } from 'vitest';
import { publicGenusMediaItems, type GenusMediaItem } from '@/lib/genusMediaResolver';

const item = (overrides: Partial<GenusMediaItem> = {}): GenusMediaItem => ({
  media_id: 'm1',
  taxon_id: 't1',
  scientific_name: 'Vanilla planifolia',
  genus: 'Vanilla',
  image_url: 'https://example.org/orchid.jpg',
  thumbnail_url: 'https://example.org/orchid-thumb.jpg',
  source_name: 'Continuum source',
  source_record_url: null,
  license: 'CC-BY',
  attribution: null,
  media_kind: 'photograph',
  quality_score: 1,
  ...overrides,
});

describe('publicGenusMediaItems', () => {
  it('keeps canonical media with both source and license', () => {
    expect(publicGenusMediaItems([item()])).toHaveLength(1);
  });

  it('withholds media without source provenance', () => {
    expect(publicGenusMediaItems([item({ source_name: '  ' })])).toEqual([]);
  });

  it('withholds media without license provenance', () => {
    expect(publicGenusMediaItems([item({ license: null })])).toEqual([]);
  });

  it('does not require photographer attribution when source and license are present', () => {
    expect(publicGenusMediaItems([item({ attribution: null })])).toHaveLength(1);
  });
});
