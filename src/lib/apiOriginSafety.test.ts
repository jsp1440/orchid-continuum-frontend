/**
 * Item 6 of the Render deployment contract: the app must behave safely when
 * VITE_API_BASE_URL is absent or malformed, with no silent
 * SPA-HTML-as-API-success.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  API_BASE_URL,
  apiRequest,
  isJsonContentType,
  isUsableApiOrigin,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isUsableApiOrigin', () => {
  it('accepts an absolute Render origin', () => {
    expect(
      isUsableApiOrigin('https://orchid-continuum-public-api.onrender.com'),
    ).toBe(true);
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['relative path', '/api'],
    ['bare host', 'orchid-continuum-public-api.onrender.com'],
    ['protocol-relative', '//orchid-continuum-public-api.onrender.com'],
    ['nonsense', 'not a url'],
    ['wrong scheme', 'ftp://example.org'],
    ['javascript scheme', 'javascript:alert(1)'],
  ])('rejects %s', (_label, value) => {
    expect(isUsableApiOrigin(value as string | undefined)).toBe(false);
  });

  it('rejects a relative base, which is the dangerous case', () => {
    // A relative base resolves every call to Render's SPA fallback, which
    // answers 200 with the app shell. Rejecting it is what keeps a
    // configuration mistake from looking like working data.
    expect(isUsableApiOrigin('/api')).toBe(false);
  });
});

describe('apiRequest when the origin is unconfigured', () => {
  it('reports unconfigured and never invents data', async () => {
    // The suite runs with no VITE_API_BASE_URL set, so this is the real
    // unconfigured path rather than a simulated one.
    expect(API_BASE_URL).toBe('');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest('/api/species/featured');

    expect(result.unconfigured).toBe(true);
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
    // Fails closed: it does not even attempt a request that could resolve
    // against the app's own origin.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('isJsonContentType', () => {
  it('accepts JSON, with or without a charset', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true);
    expect(isJsonContentType('APPLICATION/JSON')).toBe(true);
  });

  it('rejects the SPA shell, which is the dangerous case', () => {
    // Render answers an unknown API path with index.html at status 200.
    // apiRequest turns this into an error rather than parsing it as data.
    expect(isJsonContentType('text/html')).toBe(false);
    expect(isJsonContentType('text/html; charset=utf-8')).toBe(false);
  });

  it('rejects a missing content-type rather than assuming JSON', () => {
    expect(isJsonContentType(null)).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
    expect(isJsonContentType('')).toBe(false);
  });
});
