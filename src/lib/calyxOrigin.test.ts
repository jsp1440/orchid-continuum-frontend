import { describe, expect, it } from 'vitest';

import { calyxRelativePath, isCalyxOriginUrl, requestUrlOf } from './calyxOrigin';

/**
 * The exact-origin gate every Calyx credential decision derives from. These
 * are the lookalike shapes a string-prefix check (`startsWith(base)`) accepts.
 */

const BASE = 'https://orchid-calyx-backend.onrender.com';
const HOST = 'orchid-calyx-backend.onrender.com';

describe('calyxRelativePath', () => {
  it('returns the base-relative path for a legitimate Calyx URL, without query or fragment', () => {
    expect(calyxRelativePath(`${BASE}/api/mission-control/owner/session?x=1#frag`, BASE)).toBe(
      '/api/mission-control/owner/session',
    );
    expect(calyxRelativePath(BASE, BASE)).toBe('/');
    expect(calyxRelativePath(`${BASE}/`, BASE)).toBe('/');
    // An explicit default port is the same origin.
    expect(calyxRelativePath(`https://${HOST}:443/api/x`, BASE)).toBe('/api/x');
    // Hostnames are case-insensitive.
    expect(calyxRelativePath(`https://ORCHID-CALYX-BACKEND.onrender.com/api/x`, BASE)).toBe('/api/x');
  });

  it.each([
    ['lookalike host suffix', `https://${HOST}.evil.test/api/x`],
    ['lookalike host suffix without path', `https://${HOST}.evil`],
    ['host@evil (base as userinfo)', `https://${HOST}@evil.test/api/x`],
    ['host:pass@evil', `https://${HOST}:secret@evil.test/api/x`],
    ['userinfo on the real Calyx host', `https://user:pass@${HOST}/api/x`],
    ['username only on the real Calyx host', `https://user@${HOST}/api/x`],
    ['backslash lookalike host', `https://${HOST}.evil.test\\api\\x`],
    ['backslash host@evil', `https://${HOST}.evil.test\\@${HOST}/api/x`],
    ['different port', `https://${HOST}:8443/api/x`],
    ['http instead of https', `http://${HOST}/api/x`],
    ['relative URL', '/api/mission-control/owner/session'],
    ['protocol-relative URL', `//${HOST}/api/x`],
    ['empty URL', ''],
    ['unparseable URL', 'not a url'],
  ])('rejects %s', (_label, url) => {
    expect(calyxRelativePath(url, BASE)).toBeNull();
    expect(isCalyxOriginUrl(url, BASE)).toBe(false);
  });

  it('follows the fetch URL parser: a backslash before @ ends the authority, so the host is Calyx', () => {
    // WHATWG treats "\" as "/" for special schemes, so fetch really sends this
    // to the Calyx host with path "/@evil.test". Matching the parser, not the
    // string, is the point.
    expect(calyxRelativePath(`https://${HOST}\\@evil.test`, BASE)).toBe('/@evil.test');
  });

  it('matches the base path on a segment boundary only', () => {
    const pathBase = 'https://calyx.example.test/calyx';
    expect(calyxRelativePath('https://calyx.example.test/calyx', pathBase)).toBe('/');
    expect(calyxRelativePath('https://calyx.example.test/calyx/', pathBase)).toBe('/');
    expect(calyxRelativePath('https://calyx.example.test/calyx/api/x?q=1', pathBase)).toBe('/api/x');
    expect(calyxRelativePath('https://calyx.example.test/calyxx/api/x', pathBase)).toBeNull();
    expect(calyxRelativePath('https://calyx.example.test/api/x', pathBase)).toBeNull();
    // A trailing slash on the configured base is the same base.
    expect(calyxRelativePath('https://calyx.example.test/calyx/api/x', `${pathBase}/`)).toBe('/api/x');
  });

  it.each([
    ['empty base', ''],
    ['relative base', '/calyx'],
    ['bare-host base', HOST],
    ['unparseable base', 'not a url'],
    ['opaque-origin base', 'data:text/plain,calyx'],
    ['non-http base', 'file:///calyx'],
  ])('fails closed for a %s', (_label, base) => {
    expect(calyxRelativePath(`${BASE}/api/x`, base)).toBeNull();
    expect(calyxRelativePath('/calyx/api/x', base)).toBeNull();
    expect(calyxRelativePath('data:text/plain,calyx', base)).toBeNull();
  });

  it('accepts URL objects the same as strings', () => {
    expect(calyxRelativePath(new URL(`${BASE}/api/x?y=1`), BASE)).toBe('/api/x');
    expect(calyxRelativePath(new URL(`https://${HOST}.evil.test/api/x`), BASE)).toBeNull();
  });
});

describe('requestUrlOf', () => {
  it('reads strings, URL objects and Request objects', () => {
    expect(requestUrlOf(`${BASE}/api/x`)).toBe(`${BASE}/api/x`);
    expect(requestUrlOf(new URL(`${BASE}/api/x`))).toBe(`${BASE}/api/x`);
    expect(requestUrlOf(new Request(`${BASE}/api/x?y=1`))).toBe(`${BASE}/api/x?y=1`);
    expect(requestUrlOf(new Request(`https://${HOST}.evil.test/api/x`))).toBe(`https://${HOST}.evil.test/api/x`);
  });
});
