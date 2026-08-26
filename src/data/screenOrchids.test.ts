import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SCREEN_ORCHIDS,
  SCREEN_ORCHIDS_PROVENANCE,
  type ScreenOrchidEntry,
} from './screenOrchids';

/**
 * The licensing boundary on the recovered film writing.
 *
 * The retired Hollywood Orchids widget re-hosted copyrighted film posters on
 * Google Drive and linked YouTube embeds of complete features. The FCOS
 * authors' own prose and the factual credits are freely publishable; the media
 * is not, and the retired application having shipped it is not a reason to
 * keep shipping it.
 *
 * These tests guard the boundary at the data layer rather than trusting the
 * extraction to have been careful once. The strongest is the last: a scan of
 * the file itself, so a URL added later by hand fails here even if it is typed
 * into a field that does not exist yet.
 */

const SOURCE = readFileSync(resolve(process.cwd(), 'src/data/screenOrchids.ts'), 'utf8');

const serialized = JSON.stringify(SCREEN_ORCHIDS);

describe('recovered film readings', () => {
  it('recovered the whole collection', () => {
    expect(SCREEN_ORCHIDS).toHaveLength(20);
  });

  it('kept the writing that made the collection worth recovering', () => {
    // Credits alone would not have been worth a port.
    const withProse = SCREEN_ORCHIDS.filter(
      (film) => (film.description?.length ?? 0) > 80 && (film.orchidSignificance?.length ?? 0) > 0,
    );
    expect(withProse.length).toBeGreaterThanOrEqual(18);
  });

  it('attributes the writing rather than presenting it as anonymous', () => {
    expect(SCREEN_ORCHIDS_PROVENANCE.authorship).toMatch(/FCOS article collection/i);
    expect(SCREEN_ORCHIDS_PROVENANCE.statement).toMatch(/No posters, stills, trailers or film links/i);
  });

  it('gives every entry a stable slug and a title', () => {
    const slugs = SCREEN_ORCHIDS.map((film) => film.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const film of SCREEN_ORCHIDS) {
      expect(film.slug).toMatch(/^[a-z0-9_]+$/);
      expect(film.title.length).toBeGreaterThan(0);
    }
  });
});

describe('no copyrighted media crossed', () => {
  it('carries no URL of any kind', () => {
    expect(serialized).not.toMatch(/https?:\/\//);
  });

  it('carries no re-hosted poster reference', () => {
    // The legacy fields were poster_drive_id and poster_alt_drive_id.
    for (const marker of ['drive_id', 'driveId', 'poster', 'drive.google']) {
      expect(serialized.toLowerCase()).not.toContain(marker.toLowerCase());
    }
  });

  it('carries no film or trailer link', () => {
    for (const marker of ['youtube', 'youtu.be', 'justwatch', 'full_movie', 'trailer', 'embed']) {
      expect(serialized.toLowerCase()).not.toContain(marker);
    }
  });

  it('has no field a media URL could be added to', () => {
    // Structural, not incidental: a contributor cannot add a poster without
    // first changing the type, which is where the reasoning lives.
    const permitted: Array<keyof ScreenOrchidEntry> = [
      'slug',
      'title',
      'year',
      'director',
      'stars',
      'genre',
      'orchidFocus',
      'description',
      'orchidSignificance',
      'portrayalNote',
      'contributedBy',
    ];
    for (const film of SCREEN_ORCHIDS) {
      for (const key of Object.keys(film)) {
        expect(permitted, `unexpected field "${key}"`).toContain(key as keyof ScreenOrchidEntry);
      }
    }
  });

  it('has no URL anywhere in the data file, not merely in the parsed values', () => {
    // Catches a link added by hand in a comment or a new field — the case the
    // serialized checks above would miss.
    const dataSection = SOURCE.slice(SOURCE.indexOf('export const SCREEN_ORCHIDS:'));
    expect(dataSection).not.toMatch(/https?:\/\//);
  });
});

describe('the portrayal note is not a scientific claim', () => {
  it('renames the overstated legacy field', () => {
    // The source called this `scientific_accuracy`. It is a critic's remark
    // about a film's imagery, not an assessment against a botanical record,
    // and carrying the old name would have made it sound checked.
    expect(serialized).not.toContain('scientificAccuracy');
    expect(SCREEN_ORCHIDS.some((film) => (film.portrayalNote?.length ?? 0) > 0)).toBe(true);
  });
});
