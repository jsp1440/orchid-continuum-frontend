import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGlossaryWorkflowOnFile } from '@/lib/glossary/run';
import { GlossaryParseError } from '@/lib/glossary/types';

const CSV =
  'term,definition,category,synonyms,related terms,source,source citation,notes\n' +
  'Velamen,Spongy epidermis on aerial roots,morphology,velamen radicum,root; epiphyte,Pridgeon 1987,"Pridgeon 1987, p.3",Key adaptation\n' +
  'Column,Central reproductive structure fusing stamen and pistil,morphology,gynostemium,stigma,Dressler 1981,,\n' +
  ',A record with no term,,,,,,\n';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'glossary-run-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeInput(name: string, content: string): string {
  const p = join(workDir, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

describe('runGlossaryWorkflowOnFile', () => {
  it('creates the full output package on disk', () => {
    const input = writeInput('glossary.csv', CSV);
    const outDir = join(workDir, 'out');
    const summary = runGlossaryWorkflowOnFile({ inputPath: input, outputDir: outDir });

    expect(summary.stats.acceptedRecords).toBe(2);
    expect(summary.stats.rejectedRecords).toBe(1);

    expect(existsSync(join(outDir, 'glossary-normalized.json'))).toBe(true);
    expect(existsSync(join(outDir, 'rejections.json'))).toBe(true);
    expect(existsSync(join(outDir, 'processing-summary.json'))).toBe(true);

    const termFiles = readdirSync(join(outDir, 'terms')).sort();
    expect(termFiles).toEqual(['column.md', 'velamen.md']);

    const md = readFileSync(join(outDir, 'terms', 'velamen.md'), 'utf8');
    expect(md).toContain('# Velamen');
    expect(md).toContain('Generated illustration prompt');
    expect(md).toContain('Proposed Knowledge Graph metadata');

    const rejections = JSON.parse(readFileSync(join(outDir, 'rejections.json'), 'utf8'));
    expect(rejections.rejectedCount).toBe(1);
    expect(rejections.rejections[0].reasonCode).toBe('missing_term');
  });

  it('writes deterministic normalized JSON (identical bytes across runs)', () => {
    const input = writeInput('glossary.csv', CSV);
    runGlossaryWorkflowOnFile({ inputPath: input, outputDir: join(workDir, 'a') });
    runGlossaryWorkflowOnFile({ inputPath: input, outputDir: join(workDir, 'b') });
    const a = readFileSync(join(workDir, 'a', 'glossary-normalized.json'), 'utf8');
    const b = readFileSync(join(workDir, 'b', 'glossary-normalized.json'), 'utf8');
    expect(a).toBe(b);
  });

  it('validation-only (dry run) writes nothing but still reports', () => {
    const input = writeInput('glossary.csv', CSV);
    const outDir = join(workDir, 'out');
    const summary = runGlossaryWorkflowOnFile({ inputPath: input, outputDir: outDir, dryRun: true });
    expect(summary.stats.acceptedRecords).toBe(2);
    expect(existsSync(outDir)).toBe(false);
    expect(summary.outputPaths.termMarkdown).toEqual([]);
  });

  it('detects JSON format from the extension', () => {
    const input = writeInput('glossary.json', '[{"term":"Velamen","definition":"Spongy layer"}]');
    const summary = runGlossaryWorkflowOnFile({ inputPath: input, outputDir: join(workDir, 'out') });
    expect(summary.source.format).toBe('json');
    expect(summary.stats.acceptedRecords).toBe(1);
  });

  it('honors an explicit format override', () => {
    const input = writeInput('glossary.data', '[{"term":"Velamen","definition":"Spongy layer"}]');
    const summary = runGlossaryWorkflowOnFile({
      inputPath: input,
      outputDir: join(workDir, 'out'),
      format: 'json',
    });
    expect(summary.source.format).toBe('json');
  });

  it('throws GlossaryParseError for an undeterminable format', () => {
    const input = writeInput('glossary.data', 'anything');
    expect(() =>
      runGlossaryWorkflowOnFile({ inputPath: input, outputDir: join(workDir, 'out') }),
    ).toThrow(GlossaryParseError);
  });

  it('requires no production database or network (fetch stubbed to throw)', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch' as never)
      .mockImplementation(() => {
        throw new Error('network access is forbidden in this workflow');
      });
    // Clear anything that might look like production DB config.
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_URL;

    const input = writeInput('glossary.csv', CSV);
    const summary = runGlossaryWorkflowOnFile({ inputPath: input, outputDir: join(workDir, 'out') });
    expect(summary.stats.acceptedRecords).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('injectable clock/elapsed keeps summary runtime controllable for tests', () => {
    const input = writeInput('glossary.csv', CSV);
    const summary = runGlossaryWorkflowOnFile({
      inputPath: input,
      outputDir: join(workDir, 'out'),
      now: () => new Date('2020-01-01T00:00:00.000Z'),
      elapsedMs: 1.5,
    });
    expect(summary.runtime.generatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(summary.runtime.elapsedMs).toBe(1.5);
  });
});
