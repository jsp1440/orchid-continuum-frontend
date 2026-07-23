/**
 * Filesystem runner for the Glossary Preparation Workflow: read an input file,
 * run the deterministic core, and write a reviewable output package.
 *
 * SAFETY: the only side effects are reading the given input file and writing
 * files under the given output directory. No network, no database, no external
 * services, no deployment actions.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { detectFormat, parseInput } from './parse.ts';
import { buildRejectionReport, renderTermMarkdown } from './render.ts';
import { runGlossaryWorkflow } from './workflow.ts';
import {
  GlossaryParseError,
  type GlossaryInputFormat,
  type GlossaryWorkflowResult,
  type ProcessingSummary,
} from './types.ts';

export interface RunOptions {
  inputPath: string;
  outputDir: string;
  /** Explicit format; when omitted it is detected from the file extension. */
  format?: GlossaryInputFormat;
  /** Validation-only: run everything but write nothing to disk. */
  dryRun?: boolean;
  /** Injectable clock (for tests). Defaults to the wall clock. */
  now?: () => Date;
  /** Injectable elapsed time in ms (for tests). Defaults to measured time. */
  elapsedMs?: number;
}

/** Write the JSON output files and Markdown pages for a workflow result. */
export function writeOutputPackage(
  result: GlossaryWorkflowResult,
  outputDir: string,
): ProcessingSummary['outputPaths'] {
  const termsDir = join(outputDir, 'terms');
  mkdirSync(termsDir, { recursive: true });

  const normalizedJson = join(outputDir, 'glossary-normalized.json');
  writeFileSync(normalizedJson, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const rejectionsJson = join(outputDir, 'rejections.json');
  writeFileSync(rejectionsJson, `${JSON.stringify(buildRejectionReport(result), null, 2)}\n`, 'utf8');

  const usedNames = new Set<string>();
  const termMarkdown: string[] = [];
  for (const entry of result.accepted) {
    let name = entry.slug;
    if (usedNames.has(name)) {
      // Deterministic disambiguation for slug collisions.
      name = `${entry.slug}-${entry.workflowRecordId.split('_').pop()}`;
    }
    usedNames.add(name);
    const filePath = join(termsDir, `${name}.md`);
    writeFileSync(filePath, renderTermMarkdown(entry), 'utf8');
    termMarkdown.push(filePath);
  }

  return {
    outputDir,
    normalizedJson,
    rejectionsJson,
    processingSummaryJson: join(outputDir, 'processing-summary.json'),
    termMarkdown,
  };
}

/**
 * Run the full workflow against a file and (unless dryRun) write the output
 * package. Returns a ProcessingSummary including runtime metadata.
 * Throws GlossaryParseError for unrecoverable input problems.
 */
export function runGlossaryWorkflowOnFile(options: RunOptions): ProcessingSummary {
  const clock = options.now ?? (() => new Date());
  const start = process.hrtime.bigint();

  const fileName = basename(options.inputPath);
  const format = options.format ?? detectFormat(fileName);
  if (!format) {
    throw new GlossaryParseError(
      `Cannot determine format for "${fileName}"; use a .csv or .json extension or pass an explicit format`,
    );
  }

  const content = readFileSync(options.inputPath, 'utf8');
  const records = parseInput(content, format);
  const result = runGlossaryWorkflow(records, { fileName, format });

  let outputPaths: ProcessingSummary['outputPaths'];
  if (options.dryRun) {
    outputPaths = {
      outputDir: options.outputDir,
      normalizedJson: '',
      rejectionsJson: '',
      processingSummaryJson: '',
      termMarkdown: [],
    };
  } else {
    outputPaths = writeOutputPackage(result, options.outputDir);
  }

  const elapsedMs =
    options.elapsedMs ?? Number(process.hrtime.bigint() - start) / 1_000_000;

  const summary: ProcessingSummary = {
    workflowVersion: result.workflowVersion,
    source: result.source,
    stats: result.stats,
    outputPaths,
    runtime: {
      generatedAt: clock().toISOString(),
      elapsedMs,
    },
  };

  if (!options.dryRun) {
    writeFileSync(
      outputPaths.processingSummaryJson,
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    );
  }

  return summary;
}
