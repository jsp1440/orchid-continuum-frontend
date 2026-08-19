import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appLayoutPath = path.resolve(process.cwd(), 'src/components/AppLayout.tsx');
const source = fs.readFileSync(appLayoutPath, 'utf8');

describe('homepage public error boundary', () => {
  it('does not render raw exception messages or stack traces to visitors', () => {
    expect(source).not.toContain('errorStack');
    expect(source).not.toContain('this.state.errorMessage');
    expect(source).not.toContain('this.state.errorStack');
    expect(source).not.toContain('Orchid Continuum Diagnostic');
  });

  it('fails closed with an honest unavailable state', () => {
    expect(source).toContain('Continuum section unavailable');
    expect(source).toContain('No scientific fallback content has been substituted.');
    expect(source).toContain('console.error(`[Orchid Continuum] ${this.props.name} failed`, error)');
  });
});
