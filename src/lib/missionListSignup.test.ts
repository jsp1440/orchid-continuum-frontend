import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CRM_SUBSCRIBE_PATH,
  crmSubscribeUrl,
  missionListMailto,
  submitMissionListSignup,
} from './missionListSignup';

const request = {
  email: 'person@example.org',
  source: 'orchid-continuum-get-involved',
  role: 'citizen',
};

function respond(
  body: string,
  init: { status?: number; contentType?: string } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('crmSubscribeUrl', () => {
  it('is absolute, never a relative path', () => {
    const url = crmSubscribeUrl();
    expect(url.startsWith('http')).toBe(true);
    expect(url.endsWith(CRM_SUBSCRIBE_PATH)).toBe(true);
  });
});

describe('submitMissionListSignup', () => {
  it('reports delivered only for a JSON 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond('{"ok":true}')));
    await expect(submitMissionListSignup(request)).resolves.toEqual({
      kind: 'delivered',
    });
  });

  it('does NOT report delivered for a 200 that is the SPA shell', async () => {
    // The original bug: Render's public/_redirects rewrites every unmatched
    // path to index.html, so the old relative POST got 200 + HTML and the
    // form told the visitor they were subscribed.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respond('<!doctype html><html><body>app shell</body></html>', {
          contentType: 'text/html; charset=utf-8',
        }),
      ),
    );
    const outcome = await submitMissionListSignup(request);
    expect(outcome.kind).toBe('rejected');
    expect(outcome.kind === 'rejected' && outcome.reason).toMatch(/not configured/i);
  });

  it('reports rejected for a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond('{}', { status: 502 })));
    const outcome = await submitMissionListSignup(request);
    expect(outcome.kind).toBe('rejected');
    expect(outcome.kind === 'rejected' && outcome.reason).toContain('502');
  });

  it('reports unreachable when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(submitMissionListSignup(request)).resolves.toEqual({
      kind: 'unreachable',
      reason: 'The signup service could not be reached.',
    });
  });

  it('propagates an abort so callers can cancel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError');
      }),
    );
    await expect(submitMissionListSignup(request)).rejects.toThrow(DOMException);
  });

  it('posts to an absolute url with the submitted address', async () => {
    const fetchMock = vi.fn(async () => respond('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    await submitMissionListSignup(request);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url.startsWith('http')).toBe(true);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: request.email,
      source: request.source,
      role: request.role,
    });
  });
});

describe('missionListMailto', () => {
  it('carries the address and role to a channel a person reads', () => {
    const mailto = missionListMailto(request);
    expect(mailto.startsWith('mailto:info@orchidcontinuum.org')).toBe(true);
    expect(decodeURIComponent(mailto)).toContain(request.email);
    expect(decodeURIComponent(mailto)).toContain('citizen');
  });
});
