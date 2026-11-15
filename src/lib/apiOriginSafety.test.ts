/**
 * Item 6 of the Render deployment contract: the app must behave safely when
 * VITE_API_BASE_URL is absent or malformed, with no silent
 * SPA-HTML-as-API-success.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isJsonContentType,
  isUsableApiOrigin,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function apiWithOrigins(primary?: string, fallback?: string) {
  vi.stubEnv('VITE_API_BASE_URL', primary);
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', fallback);
  // The client computes its origin at import time, so import after isolation.
  vi.resetModules();
  return import('./api');
}

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
    const { API_BASE_URL, apiRequest } = await apiWithOrigins();
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

describe('apiRequest with an explicitly configured origin', () => {
  it.each([
    ['https://primary.example.test', 'https://fallback.example.test', 'https://primary.example.test'],
    [undefined, 'https://fallback.example.test', 'https://fallback.example.test'],
  ])('uses primary %s and fallback %s without ambient deployment configuration', async (primary, fallback, expected) => {
    const { API_BASE_URL, apiRequest } = await apiWithOrigins(primary, fallback);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ fixture: true }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    expect(API_BASE_URL).toBe(expected);
    const result = await apiRequest('/api/species/featured');
    expect(result.data).toEqual({ fixture: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(`${expected}/api/species/featured`);
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
