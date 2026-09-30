import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ATLAS_BASE_TABLE,
  ATLAS_PUBLIC_VIEW,
  ATLAS_PUBLIC_VIEW_COLUMNS,
  __resetAtlasOccurrenceSourceForTests,
  atlasLocationProtectionNotice,
  atlasRelationFor,
  isMissingRelationError,
  isProtectivePublishedReason,
  markAtlasPublicViewMissing,
  resolveAtlasOccurrenceSourceMode,
  sourcePrecisionPolicy,
  sourcePublishedCellDeg,
  sourceWithheld,
} from './atlasOccurrenceSource';
import { isCitesAppendixIOrchid } from './atlasCitesAppendixI';

afterEach(() => __resetAtlasOccurrenceSourceForTests());

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'docs/atlas-next/migrations/20260930_atlas_occurrences_locality_protection.sql'),
  'utf8',
);

describe('atlas occurrence source mode', () => {
  it('defaults to auto and accepts only view / table overrides', () => {
    expect(resolveAtlasOccurrenceSourceMode(undefined)).toBe('auto');
    expect(resolveAtlasOccurrenceSourceMode('')).toBe('auto');
    expect(resolveAtlasOccurrenceSourceMode(' VIEW ')).toBe('view');
    expect(resolveAtlasOccurrenceSourceMode('table')).toBe('table');
    expect(resolveAtlasOccurrenceSourceMode('raw-please')).toBe('auto');
  });

  it('auto reads the protected view until it is known to be missing', () => {
    expect(atlasRelationFor('auto')).toBe(ATLAS_PUBLIC_VIEW);
    markAtlasPublicViewMissing();
    expect(atlasRelationFor('auto')).toBe(ATLAS_BASE_TABLE);
    // An explicit `view` pin never downgrades, even after a miss.
    expect(atlasRelationFor('view')).toBe(ATLAS_PUBLIC_VIEW);
    expect(atlasRelationFor('table')).toBe(ATLAS_BASE_TABLE);
  });
});

describe('missing-relation detection (the only fallback trigger)', () => {
  it('recognises PostgREST and Postgres missing-relation errors', () => {
    expect(isMissingRelationError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
    expect(isMissingRelationError({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(
      isMissingRelationError({ message: `Could not find the table 'public.${ATLAS_PUBLIC_VIEW}' in the schema cache` }),
    ).toBe(true);
    expect(isMissingRelationError({ message: `relation "${ATLAS_PUBLIC_VIEW}"` }, 404)).toBe(true);
  });

  it('never treats permission, transport or server errors as missing', () => {
    expect(isMissingRelationError(null)).toBe(false);
    expect(isMissingRelationError({ code: '42501', message: `permission denied for view ${ATLAS_PUBLIC_VIEW}` })).toBe(false);
    expect(isMissingRelationError({ code: '', message: 'Bad gateway' }, 502)).toBe(false);
    expect(isMissingRelationError({ message: 'TypeError: Failed to fetch' })).toBe(false);
    expect(isMissingRelationError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
  });
});

describe('source-published precision', () => {
  it('treats only protection reasons as withholding', () => {
    for (const r of ['threatened', 'cites-appendix-i', 'curated-sensitive', 'unresolved-assessment']) {
      expect(isProtectivePublishedReason(r)).toBe(true);
    }
    for (const r of ['exact', 'curated-release', 'source-imprecision', undefined, null, '']) {
      expect(isProtectivePublishedReason(r)).toBe(false);
    }
    expect(sourceWithheld({ localityWithheldAtSource: true })).toBe(true);
    expect(sourceWithheld({ publishedPrecisionReason: 'source-imprecision' })).toBe(false);
  });

  it('ignores missing, zero or malformed cells', () => {
    expect(sourcePublishedCellDeg({})).toBe(0);
    expect(sourcePublishedCellDeg({ publishedCellDeg: 0 })).toBe(0);
    expect(sourcePublishedCellDeg({ publishedCellDeg: Number.NaN })).toBe(0);
    expect(sourcePublishedCellDeg({ publishedCellDeg: -1 })).toBe(0);
    expect(sourcePublishedCellDeg({ publishedCellDeg: 0.25 })).toBe(0.25);
  });

  it('maps view reasons onto the client vocabulary and treats unknown reasons as precaution', () => {
    expect(sourcePrecisionPolicy({ publishedCellDeg: 0.5, publishedPrecisionReason: 'threatened' })?.reason).toBe(
      'conservation-status',
    );
    expect(sourcePrecisionPolicy({ publishedCellDeg: 0.1, publishedPrecisionReason: 'cites-appendix-i' })?.notice).toMatch(
      /CITES Appendix I/,
    );
    expect(
      sourcePrecisionPolicy({ publishedCellDeg: 0.25, publishedPrecisionReason: 'source-imprecision' })?.reason,
    ).toBe('coordinate-uncertainty');
    expect(sourcePrecisionPolicy({ publishedCellDeg: 0.05, publishedPrecisionReason: 'something-new' })?.reason).toBe(
      'unresolved-assessment',
    );
    expect(sourcePrecisionPolicy({ publishedCellDeg: 0, publishedPrecisionReason: 'exact' })).toBeNull();
  });

  it('always states how locations are shown, and only claims source protection for the view', () => {
    expect(atlasLocationProtectionNotice('protected-view').title).toBe('Precise locations protected');
    expect(atlasLocationProtectionNotice('legacy-table').title).toBe('Locations generalised');
    expect(atlasLocationProtectionNotice('unknown').body).not.toMatch(/at the source/);
  });
});

describe('client and migration stay in lockstep', () => {
  it('selects only columns the migration view publishes', () => {
    const viewSection = MIGRATION.slice(MIGRATION.indexOf('CREATE VIEW public.atlas_occurrences_public'));
    for (const col of ATLAS_PUBLIC_VIEW_COLUMNS.split(',').map((c) => c.trim())) {
      expect(viewSection, `view must publish ${col}`).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('applies the same CITES Appendix I list on both sides', () => {
    const block = MIGRATION.slice(MIGRATION.indexOf('cites_appendix_i (genus, epithet) AS'), MIGRATION.indexOf('named AS ('));
    const sqlPairs = Array.from(block.matchAll(/\('([a-z]+)',\s*(?:'([a-z]+)'|NULL(?:::text)?)\)/g)).map(
      (m) => [m[1], m[2] ?? null] as const,
    );
    expect(sqlPairs.length).toBeGreaterThan(5);
    for (const [genus, epithet] of sqlPairs) {
      expect(isCitesAppendixIOrchid({ genus, species: epithet ?? 'anything' }), `${genus} ${epithet}`).toBe(true);
    }
    expect(isCitesAppendixIOrchid({ canonicalName: 'Paphiopedilum anything' })).toBe(true);
    expect(isCitesAppendixIOrchid({ genus: 'Cattleya', species: 'labiata' })).toBe(false);
    expect(isCitesAppendixIOrchid({})).toBe(false);
  });

  it('keeps the owner-applied markers and never applies itself', () => {
    expect(MIGRATION).toMatch(/OWNER-APPLIED MIGRATION/);
    expect(MIGRATION).toMatch(/security_invoker = false/);
    expect(MIGRATION).toMatch(/security_barrier = true/);
    expect(MIGRATION).toMatch(/REVOKE SELECT ON public\.atlas_occurrences FROM anon, authenticated;/);
    // No statement that removes or rewrites rows.
    expect(MIGRATION).not.toMatch(/^\s*(DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE)\b/im);
  });
});
