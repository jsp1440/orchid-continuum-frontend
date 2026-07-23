#!/usr/bin/env node
/**
 * CLI for the Glossary Preparation Workflow (OC-AUTO-001).
 *
 * Usage:
 *   node scripts/prepare-glossary.mjs --input <file.csv|file.json> --out <dir> [options]
 *
 * Options:
 *   --input, -i <path>     Input glossary file (.csv or .json). Required.
 *   --out, -o <dir>        Output directory for the review package. Default: ./glossary-output
 *   --format <csv|json>    Force the input format (otherwise inferred from the extension).
 *   --dry-run              Validate and report only; write no files.
 *   --quiet                Print only the final JSON summary line.
 *   --help, -h             Show this help.
 *
 * Safety: reads the input file and writes files under the output directory only.
 * No network, database, deployment, or external-AI calls are performed.
 * Exits non-zero on unrecoverable execution failures.
 *
 * This entrypoint relies on Node's native TypeScript type-stripping
 * (Node >= 22.6) to import the workflow core written in TypeScript.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runGlossaryWorkflowOnFile } from '../src/lib/glossary/run.ts';
import { GlossaryParseError } from '../src/lib/glossary/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

function parseArgs(argv) {
  const opts = { outputDir: resolve(REPO_ROOT, 'glossary-output'), dryRun: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
      case '-i':
        opts.inputPath = argv[++i];
        break;
      case '--out':
      case '-o':
        opts.outputDir = resolve(process.cwd(), argv[++i]);
        break;
      case '--format':
        opts.format = argv[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--quiet':
        opts.quiet = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !opts.inputPath) {
          opts.inputPath = arg;
        } else {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }
  return opts;
}

const HELP = `Glossary Preparation Workflow (OC-AUTO-001)

Usage:
  node scripts/prepare-glossary.mjs --input <file.csv|file.json> --out <dir> [options]

Options:
  --input, -i <path>   Input glossary file (.csv or .json). Required.
  --out, -o <dir>      Output directory. Default: ./glossary-output
  --format <csv|json>  Force the input format (otherwise inferred from extension).
  --dry-run            Validate and report only; write no files.
  --quiet              Print only the final JSON summary line.
  --help, -h           Show this help.
`;

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${HELP}`);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (!opts.inputPath) {
    process.stderr.write(`Error: --input is required.\n\n${HELP}`);
    process.exit(2);
  }

  if (opts.format && opts.format !== 'csv' && opts.format !== 'json') {
    process.stderr.write(`Error: --format must be "csv" or "json".\n`);
    process.exit(2);
  }

  try {
    const summary = runGlossaryWorkflowOnFile({
      inputPath: resolve(process.cwd(), opts.inputPath),
      outputDir: opts.outputDir,
      format: opts.format,
      dryRun: opts.dryRun,
    });

    if (!opts.quiet) {
      const { stats } = summary;
      process.stdout.write(
        [
          `Glossary Preparation Workflow v${summary.workflowVersion}`,
          `  Source:              ${summary.source.fileName} (${summary.source.format})`,
          `  Total input records: ${stats.totalInputRecords}`,
          `  Accepted:            ${stats.acceptedRecords}`,
          `  Rejected:            ${stats.rejectedRecords}`,
          `  Duplicates:          ${stats.duplicateRecords}`,
          `  Conflicting dupes:   ${stats.conflictingDuplicates}`,
          `  Warnings:            ${stats.warningCount}`,
          `  Elapsed:             ${summary.runtime.elapsedMs.toFixed(1)} ms`,
          opts.dryRun ? '  Mode:                DRY RUN (no files written)' : `  Output dir:          ${summary.outputPaths.outputDir}`,
          '',
        ].join('\n'),
      );
    }
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.exit(0);
  } catch (error) {
    if (error instanceof GlossaryParseError) {
      process.stderr.write(`Input error: ${error.message}\n`);
      process.exit(1);
    }
    process.stderr.write(`Unrecoverable error: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
