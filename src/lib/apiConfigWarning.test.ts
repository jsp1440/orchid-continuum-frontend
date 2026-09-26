import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resetApiUnconfiguredWarning,
  warnApiUnconfigured,
} from './apiConfigWarning';

afterEach(() => {
  resetApiUnconfiguredWarning();
  vi.restoreAllMocks();
});

describe('warnApiUnconfigured', () => {
  it('names the variable for the operator, in the console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnApiUnconfigured('widgets');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('VITE_API_BASE_URL');
    expect(String(warn.mock.calls[0][0])).toContain('widgets');
  });

  it('warns once, not once per widget on the page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnApiUnconfigured('widgets');
    warnApiUnconfigured('widgets');
    warnApiUnconfigured('zoo');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('visitor-facing copy', () => {
  it('never shows a build variable name to a visitor', async () => {
    // The widget gallery used to render "VITE_API_BASE_URL" in its empty
    // state. Anything matching VITE_* in rendered copy is an operator
    // instruction leaking onto a public page.
    const source = await import('fs').then((fs) =>
      fs.readFileSync('src/components/widgets/index.tsx', 'utf8'),
    );
    // Strip comments, which legitimately mention the variable.
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/<Empty>[\s\S]*?VITE_[A-Z_]+/);
  });
});
