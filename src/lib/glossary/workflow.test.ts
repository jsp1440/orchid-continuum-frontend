import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCsv, parseJson } from '@/lib/glossary/parse';
import { runGlossaryWorkflow, type WorkflowSourceMeta } from '@/lib/glossary/workflow';
import { buildRejectionReport } from '@/lib/glossary/render';

const CSV_SOURCE: WorkflowSourceMeta = { fileName: 'test.csv', format: 'csv' };
const JSON_SOURCE: WorkflowSourceMeta = { fileName: 'test.json', format: 'json' };

function runCsv(csv: string) {
  return runGlossaryWorkflow(parseCsv(csv), CSV_SOURCE);
}
function runJson(json: string) {
  return runGlossaryWorkflow(parseJson(json), JSON_SOURCE);
}

describe('valid input', () => {
  it('accepts a valid CSV record with full metadata', () => {
    const result = runCsv(
      'term,definition,category,synonyms,related terms,source,source citation,notes\n' +
        'Velamen,Spongy epidermis on roots,morphology,velamen radicum,root; epiphyte,Pridgeon 1987,"Pridgeon 1987, p.3",Key adaptation',
    );
    expect(result.stats.acceptedRecords).toBe(1);
    expect(result.stats.rejectedRecords).toBe(0);
    const entry = result.accepted[0];
    expect(entry.glossary.term).toBe('Velamen');
    expect(entry.reviewStatus).toBe('pending_review');
    expect(entry.provenance.originalValues.term).toBe('Velamen');
    expect(entry.workflowRecordId).toMatch(/^gloss_velamen_[0-9a-f]{10}$/);
    expect(entry.illustrationPrompt.prompt).toContain('Velamen');
    expect(entry.proposedNode.publicationStatus).toBe('proposed');
  });

  it('accepts a valid JSON record and normalizes list fields', () => {
    const result = runJson(
      '[{"term":"Column","definition":"Reproductive structure","synonyms":["gynostemium","gynostemium"],"relatedTerms":["stigma","pollinia"]}]',
    );
    expect(result.stats.acceptedRecords).toBe(1);
    // deduped + sorted
    expect(result.accepted[0].glossary.synonyms).toEqual(['gynostemium']);
    expect(result.accepted[0].glossary.relatedTerms).toEqual(['pollinia', 'stigma']);
  });
});

describe('required-field validation', () => {
  it('rejects a blank term', () => {
    const result = runCsv('term,definition\n   ,A definition');
    expect(result.stats.acceptedRecords).toBe(0);
    expect(result.rejected[0].reasonCode).toBe('missing_term');
    expect(result.rejected[0].sourceRecordNumber).toBe(1);
  });

  it('rejects a blank definition', () => {
    const result = runCsv('term,definition\nVelamen,   ');
    expect(result.rejected[0].reasonCode).toBe('missing_definition');
    expect(result.rejected[0].suppliedTerm).toBe('Velamen');
  });

  it('rejects a record missing the definition field entirely', () => {
    const result = runJson('[{"term":"Velamen"}]');
    expect(result.rejected[0].reasonCode).toBe('missing_definition');
  });

  it('rejects a malformed record with no recognizable fields', () => {
    const result = runJson('[42]');
    expect(result.rejected[0].reasonCode).toBe('malformed_record');
  });

  it('rejects an invalid field type for term', () => {
    const result = runJson('[{"term":{"nested":true},"definition":"d"}]');
    expect(result.rejected[0].reasonCode).toBe('invalid_field_type');
  });

  it('captures recoverable fields on rejection', () => {
    const result = runJson('[{"term":"","definition":"A spongy layer","category":"morphology"}]');
    expect(result.rejected[0].recoverableFields.definition).toBe('A spongy layer');
    expect(result.rejected[0].recoverableFields.category).toBe('morphology');
  });
});

describe('duplicate handling', () => {
  it('drops a duplicate term with an identical definition (keeps the first)', () => {
    const result = runJson(
      '[{"term":"Velamen","definition":"Spongy layer"},{"term":"velamen","definition":"Spongy layer"}]',
    );
    expect(result.stats.acceptedRecords).toBe(1);
    expect(result.stats.duplicateRecords).toBe(1);
    expect(result.stats.conflictingDuplicates).toBe(0);
    expect(result.warnings.some((w) => w.code === 'duplicate_identical')).toBe(true);
  });

  it('rejects a duplicate term with a conflicting definition', () => {
    const result = runJson(
      '[{"term":"Velamen","definition":"Spongy layer"},{"term":"Velamen","definition":"A totally different meaning"}]',
    );
    expect(result.stats.acceptedRecords).toBe(1);
    expect(result.stats.conflictingDuplicates).toBe(1);
    const rejection = result.rejected[0];
    expect(rejection.reasonCode).toBe('conflicting_duplicate_definition');
    expect(rejection.sourceRecordNumber).toBe(2);
  });
});

describe('Unicode botanical terminology', () => {
  it('normalizes and preserves Unicode terms and definitions', () => {
    const result = runJson(
      JSON.stringify([
        { term: 'Ophrys ×hybrida', definition: 'A hybrid measured at 50 µm across the labellum.' },
      ]),
    );
    expect(result.stats.acceptedRecords).toBe(1);
    const entry = result.accepted[0];
    expect(entry.glossary.term).toBe('Ophrys ×hybrida');
    expect(entry.slug).toBe('ophrys-hybrida');
    expect(entry.glossary.definition).toContain('µm');
    // structure inference still works on Unicode-bearing definitions
    expect(entry.illustrationPrompt.labeledStructures).toContain('labellum');
  });
});

describe('determinism', () => {
  it('produces byte-identical results across repeated runs', () => {
    const json =
      '[{"term":"Velamen","definition":"Spongy layer","synonyms":["b","a"],"relatedTerms":["root"]},' +
      '{"term":"Column","definition":"Reproductive structure"}]';
    const a = runJson(json);
    const b = runJson(json);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('contains no timestamp or elapsed-time fields in the deterministic result', () => {
    const serialized = JSON.stringify(runCsv('term,definition\nVelamen,Spongy layer'));
    expect(serialized).not.toMatch(/generatedAt|elapsedMs|timestamp/i);
  });
});

describe('rejection reporting', () => {
  it('builds a machine-readable rejection report', () => {
    const result = runCsv('term,definition\n,missing term def\nVelamen,ok');
    const report = buildRejectionReport(result);
    expect(report.rejectedCount).toBe(1);
    expect(report.rejections[0]).toMatchObject({
      sourceRecordNumber: 1,
      reasonCode: 'missing_term',
    });
  });
});

describe('safety: no network access', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never invokes fetch during a full run', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never);
    const result = runCsv(
      'term,definition,synonyms,related terms,source\nVelamen,Spongy layer,velamen radicum,root,Pridgeon 1987',
    );
    expect(result.stats.acceptedRecords).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
