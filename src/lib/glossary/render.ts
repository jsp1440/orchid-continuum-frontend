/**
 * Deterministic rendering of workflow output: one Markdown review page per
 * accepted term, plus the machine-readable rejection report. No I/O here.
 */

import type {
  AcceptedGlossaryEntry,
  GlossaryWorkflowResult,
  RejectedGlossaryRecord,
} from './types.ts';

function listOrDash(values: string[]): string {
  return values.length > 0 ? values.map((v) => `\`${v}\``).join(', ') : '_none_';
}

function valueOrDash(value: string | null): string {
  return value && value.trim() ? value : '_none_';
}

/** Render a single accepted glossary entry as a Markdown review page. */
export function renderTermMarkdown(entry: AcceptedGlossaryEntry): string {
  const { glossary, provenance, illustrationPrompt, proposedNode, proposedRelationships } = entry;
  const lines: string[] = [];

  lines.push(`# ${glossary.term}`);
  lines.push('');
  lines.push(`- **Workflow record id:** \`${entry.workflowRecordId}\``);
  lines.push(`- **Review status:** ${entry.reviewStatus}`);
  lines.push(`- **Source record #:** ${provenance.sourceRecordNumber}`);
  lines.push('');

  lines.push('## Definition');
  lines.push('');
  lines.push(glossary.definition);
  lines.push('');

  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **Category:** ${valueOrDash(glossary.category)}`);
  lines.push(`- **Synonyms:** ${listOrDash(glossary.synonyms)}`);
  lines.push(`- **Related terms:** ${listOrDash(glossary.relatedTerms)}`);
  lines.push(`- **Source:** ${valueOrDash(glossary.source)}`);
  lines.push(`- **Source citation:** ${valueOrDash(glossary.sourceCitation)}`);
  if (glossary.notes) {
    lines.push(`- **Notes:** ${glossary.notes.replace(/\n/g, ' ')}`);
  }
  lines.push('');

  lines.push('## Generated illustration prompt');
  lines.push('');
  lines.push(`_Labeled structures:_ ${listOrDash(illustrationPrompt.labeledStructures)}`);
  lines.push('');
  lines.push('```text');
  lines.push(illustrationPrompt.prompt);
  lines.push('```');
  lines.push('');

  lines.push('## Proposed Knowledge Graph metadata');
  lines.push('');
  lines.push('> Proposed only — nothing is published to the graph by this workflow.');
  lines.push('');
  lines.push(`- **Node id:** \`${proposedNode.id}\``);
  lines.push(`- **Node type:** ${proposedNode.nodeType}`);
  lines.push(`- **Candidate domains:** ${listOrDash(proposedNode.domains)}`);
  lines.push(`- **Publication status:** ${proposedNode.publicationStatus}`);
  lines.push('');
  if (proposedRelationships.length > 0) {
    lines.push('**Proposed relationships:**');
    lines.push('');
    lines.push('| Type | Target | Target name |');
    lines.push('| --- | --- | --- |');
    for (const rel of proposedRelationships) {
      lines.push(`| ${rel.type} | \`${rel.targetId}\` | ${rel.targetName} |`);
    }
    lines.push('');
  } else {
    lines.push('_No proposed relationships._');
    lines.push('');
  }

  lines.push('## Warnings');
  lines.push('');
  if (entry.warnings.length > 0) {
    for (const w of entry.warnings) {
      lines.push(`- \`${w.code}\`: ${w.message}`);
    }
  } else {
    lines.push('_none_');
  }
  lines.push('');

  return lines.join('\n');
}

/** The machine-readable rejection report payload. */
export interface RejectionReport {
  workflowVersion: string;
  sourceFile: string;
  rejectedCount: number;
  rejections: Array<{
    sourceRecordNumber: number;
    suppliedTerm: string | null;
    reasonCode: RejectedGlossaryRecord['reasonCode'];
    reason: string;
    recoverableFields: RejectedGlossaryRecord['recoverableFields'];
  }>;
}

/** Build the deterministic rejection report from a workflow result. */
export function buildRejectionReport(result: GlossaryWorkflowResult): RejectionReport {
  return {
    workflowVersion: result.workflowVersion,
    sourceFile: result.source.fileName,
    rejectedCount: result.rejected.length,
    rejections: result.rejected.map((r) => ({
      sourceRecordNumber: r.sourceRecordNumber,
      suppliedTerm: r.suppliedTerm,
      reasonCode: r.reasonCode,
      reason: r.reason,
      recoverableFields: r.recoverableFields,
    })),
  };
}
