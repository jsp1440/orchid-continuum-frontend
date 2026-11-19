import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No source file may contain a raw invisible Unicode format character
 * (general category Cf).
 *
 * Bidirectional controls (U+202A–U+202E, U+2066–U+2069, U+200E/U+200F,
 * U+061C) let code read differently from how it runs: an unclosed right-to-
 * left override inside a string literal can hide or reorder the text after it
 * (the "Trojan Source" pattern, CVE-2021-42574). Zero-width characters hide
 * content in the same way. A test or script that needs such a character
 * writes it as a `\uXXXX` escape, which is visible in review and behaves the
 * same at run time.
 *
 * The allow-list is intentionally empty. An entry would need a file path, the
 * exact code point, and a documented reason the escape form cannot be used.
 */

const ROOTS = ['src', 'e2e', 'scripts'];
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html',
  '.md', '.yml', '.yaml', '.txt', '.svg', '.py', '.ps1', '.sh',
]);
const ALLOWED: ReadonlyArray<{ file: string; codePoint: number; reason: string }> = [];

const FORMAT_CHARACTER = /\p{Cf}/gu;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    // Skip dependencies, build output and dot-directories (e.g. e2e/.artifacts).
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

function formatCharacterFindings(file: string, text: string): string[] {
  const findings: string[] = [];
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(FORMAT_CHARACTER)) {
      const codePoint = match[0].codePointAt(0)!;
      if (ALLOWED.some((entry) => entry.file === file && entry.codePoint === codePoint)) continue;
      const label = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
      findings.push(`${file}:${index + 1}:${(match.index ?? 0) + 1} ${label}`);
    }
  });
  return findings;
}

describe('source files contain no raw Unicode format characters', () => {
  const repo = process.cwd();
  const files = ROOTS.flatMap((root) => sourceFiles(resolve(repo, root)));

  it('scans the source, browser-journey and script trees', () => {
    const scanned = new Set(files.map((file) => relative(repo, file).split(/[\\/]/)[0]));
    expect([...scanned].sort()).toEqual([...ROOTS].sort());
    expect(files.some((file) => file.endsWith(join('src', 'pages', 'Species.tsx')))).toBe(true);
  });

  it('detects a bidi override, an isolate and a zero-width character', () => {
    const sample = ['const a = "ok";', `const b = "\u202Eevil";`, `// \u2066x\u2069 and y\u200Bz`].join('\n');
    expect(formatCharacterFindings('sample.ts', sample)).toEqual([
      'sample.ts:2:12 U+202E',
      'sample.ts:3:4 U+2066',
      'sample.ts:3:6 U+2069',
      'sample.ts:3:13 U+200B',
    ]);
    expect(formatCharacterFindings('sample.ts', 'const escaped = "\\u202E";')).toEqual([]);
  });

  it('finds none in any file (write them as \\uXXXX escapes instead)', () => {
    const findings = files.flatMap((file) =>
      formatCharacterFindings(relative(repo, file), readFileSync(file, 'utf8')),
    );
    expect(findings).toEqual([]);
  });
});
