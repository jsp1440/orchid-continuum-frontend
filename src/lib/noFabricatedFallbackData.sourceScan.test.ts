import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Source guard: hand-authored taxon "facts" and invented operational data were
 * repeatedly served to users as if they were real Continuum records. This scan
 * fails if any of the removed fallback constants reappears carrying factual
 * fields, if the genus rotation regains taxon facts, or if the specific
 * fabrication patterns come back.
 */

const ROOT = resolve(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__fixtures__' || name === 'node_modules') continue;
      walk(path, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

const SOURCES = walk(ROOT).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }));

function source(path: string): string {
  const hit = SOURCES.find((s) => s.path === path);
  if (!hit) throw new Error(`missing source ${path}`);
  return hit.text;
}

/** The balanced {...} / [...] initializer that follows `start`, skipping string literals. */
function initializerAfter(text: string, start: number): string {
  const eq = text.indexOf('=', start);
  if (eq < 0) return '';
  let i = eq + 1;
  while (i < text.length && !'{['.includes(text[i])) {
    if (text[i] === ';' || text[i] === '\n') return text.slice(eq + 1, i);
    i += 1;
  }
  const begin = i;
  let depth = 0;
  let quote: string | null = null;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(begin, i + 1);
    }
  }
  return text.slice(begin);
}

/** Object keys that carry taxon, evidence or operational facts. */
const FACTUAL_KEY_RE =
  /\b(conservation|pollinators?|pollinatorGuild|mycorrhizal|mycorrhiza_claims|fungal_dependency|elevation|elevation_range|distribution|habitat|climate|regions|plates|tribe|speciesCount|species_count|occurrence_count|atlas_summary|atlas_confidence_score|reasoning|interaction_summary|description|author|common_name|detail|label|fungi|geography|knowledge|cultivation)\s*:/;

const REMOVED_CONSTANTS = [
  'CATTLEYA_FALLBACK',
  'SAFE_MVP_PAYLOADS',
  'FALLBACK_SCIENTIFIC_INSIGHTS',
  'FALLBACK_ACTIVITY_EVENTS',
  'FALLBACK_GENUS',
  'SPECIES_COUNT_FALLBACK',
];

describe('no fabricated fallback data in source', () => {
  it('scans a non-trivial source tree', () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.some((s) => s.path === 'lib/genusData.ts')).toBe(true);
  });

  it.each(REMOVED_CONSTANTS)('%s is not re-declared with factual content anywhere in src/', (name) => {
    const decl = new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`, 'g');
    const offenders: string[] = [];
    for (const { path, text } of SOURCES) {
      for (const match of text.matchAll(decl)) {
        const init = initializerAfter(text, match.index ?? 0).trim();
        // Factual object keys, numeric literals (counts), or an alias to
        // another dataset (e.g. `= GENERA[3]`) all count as factual content.
        // Only an empty literal is tolerated.
        const empty = /^(\[\s*\]|\{\s*\})$/.test(init);
        if (!empty) offenders.push(`${path}: ${init.slice(0, 80)}`);
      }
    }
    expect(offenders, `${name} reintroduced`).toEqual([]);
  });

  it('the genus rotation carries identity only (genus + family)', () => {
    const text = source('lib/genusData.ts');
    const start = text.indexOf('export const GENERA');
    expect(start).toBeGreaterThan(-1);
    const init = initializerAfter(text, start);
    expect(init.length).toBeGreaterThan(20);
    expect(FACTUAL_KEY_RE.test(init), 'GENERA regained factual fields').toBe(false);
    const keys = new Set([...init.matchAll(/\b([A-Za-z_]+)\s*:/g)].map((m) => m[1]));
    expect([...keys].sort()).toEqual(['family', 'genus']);

    const iface = text.slice(text.indexOf('export interface GenusEntry'), text.indexOf('}', text.indexOf('export interface GenusEntry')) + 1);
    const ifaceKeys = [...iface.matchAll(/^\s*([A-Za-z_]+)\??\s*:/gm)].map((m) => m[1]).sort();
    expect(ifaceKeys).toEqual(['family', 'genus']);
    expect(text).not.toMatch(/\bbuildLocalNarrative\b/);
  });

  it('featuredGenus synthesizes no genus entries or counts', () => {
    const text = source('lib/featuredGenus.ts');
    expect(text).not.toMatch(/\bfeaturedGenusEntry\b/);
    expect(text).not.toMatch(/speciesCount/);
  });

  it('the relationship explorer has no local payloads and never labels fallback data "api"', () => {
    const text = source('lib/relationshipExplorer.ts');
    expect(text).not.toContain('safe-mvp');
    // "api" is assigned in exactly one place: the normaliser of a real response.
    expect(text.match(/source:\s*"api"/g)?.length).toBe(1);
  });

  it('runner status never defaults counters to zero', () => {
    const text = source('lib/missionControlOps.ts');
    expect(text).not.toMatch(/pickNumber\(engine,\s*\[[^\]]*\],\s*0\)/);
    expect(text).toContain('Runner status unavailable');
  });

  it('the genus occurrence map synthesizes no points', () => {
    const text = source('components/orchid/GenusOccurrenceMap.tsx');
    expect(text).not.toContain('REGION_LATLON');
    expect(text).not.toMatch(/pollinator relationship \$\{/);
    expect(text).not.toMatch(/fungal partnership \$\{/);
  });

  it('Mission Control renders no fallback insights or demo activity', () => {
    const text = source('pages/MissionControl.tsx');
    expect(text).not.toMatch(/FALLBACK_ACTIVITY_EVENTS|FALLBACK_SCIENTIFIC_INSIGHTS/);
    expect(text).not.toContain('Showing demo events');
  });
});
