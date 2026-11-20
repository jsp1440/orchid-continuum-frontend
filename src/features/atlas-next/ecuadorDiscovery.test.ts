// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  selectDiscoveryRecords, safeDiscoveryNote, readDiscoveryPassport, writeDiscoveryPassport, ECUADOR_PASSPORT_KEY,
} from './ecuadorDiscovery';

const valid = {
  accepted_name: 'Epidendrum radicans Pav. ex Lindl.',
  genus: 'Epidendrum',
  country: 'Ecuador',
  habitat: 'Cloud forest',
  elevation_m: 2249,
  source_dataset: 'GBIF',
  verified: true,
  locality_withheld: false,
  published_precision_reason: 'source-imprecision',
};

afterEach(() => localStorage.clear());

describe('Ecuador discovery record admission', () => {
  it('keeps only verified, territory-matched, publication-eligible species and approved metadata', () => {
    const result = selectDiscoveryRecords([
      { ...valid, accepted_name: 'Epidendrum ciliare', country: 'Mexico' },
      { ...valid, accepted_name: 'Epidendrum ciliare', verified: false },
      { ...valid, accepted_name: 'Epidendrum ciliare', locality_withheld: true },
      { ...valid, accepted_name: 'Epidendrum ciliare', published_precision_reason: 'unresolved-assessment' },
      { ...valid, accepted_name: 'Epidendrum ciliare', published_precision_reason: null },
      { ...valid, accepted_name: 'Epidendrum ciliare', genus: 'Dracula' },
      { ...valid, locality: 'withheld name', lat: 33.4567, lng: -12.8765, source_record_id: 'secret' },
      valid,
    ]);
    expect(result).toEqual([{
      name: 'Epidendrum radicans',
      genus: 'Epidendrum',
      country: 'Ecuador',
      habitat: 'Cloud forest',
      elevationBand: '2000–2499 m',
      source: 'GBIF',
    }]);
    expect(JSON.stringify(result)).not.toMatch(/withheld name|33\.4567|-12\.8765|secret/);
  });

  it('drops unrecognized habitat text, sources, and unusable elevation', () => {
    expect(selectDiscoveryRecords([{ ...valid, habitat: 'secret valley', elevation_m: NaN, source_dataset: 'unknown source' }])).toEqual([
      { name: 'Epidendrum radicans', genus: 'Epidendrum', country: 'Ecuador', source: 'Orchid Continuum Atlas · governed occurrence view' },
    ]);
  });
});

describe('Device-local Passport', () => {
  it('rejects recognizable site coordinates, keeps observations when saving the species again and excludes unknown properties', () => {
    expect(safeDiscoveryNote('Cloud forest; damp bark.')).toBe('Cloud forest; damp bark.');
    expect(safeDiscoveryNote('2.123, -3')).toBeNull();
    expect(safeDiscoveryNote('2, -3.456')).toBeNull();
    expect(safeDiscoveryNote('2° W')).toBeNull();
    const name = 'Epidendrum radicans';
    writeDiscoveryPassport(name, { note: 'Cloud forest; damp bark.' });
    writeDiscoveryPassport(name, {});
    expect(readDiscoveryPassport()).toEqual({ [name]: { note: 'Cloud forest; damp bark.' } });
    localStorage.setItem(ECUADOR_PASSPORT_KEY, JSON.stringify({ [name]: { note: 'GPS 2.1, -3', coordinate: 'excluded' } }));
    expect(readDiscoveryPassport()).toEqual({ [name]: {} });
  });
});
