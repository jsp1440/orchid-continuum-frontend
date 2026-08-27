import { describe, it, expect } from 'vitest';
import { assessDomainPosture, type DomainRecords } from '@/lib/security/domainPosture';

const now = () => new Date('2026-08-27T00:00:00.000Z');

function base(overrides: Partial<DomainRecords> = {}): DomainRecords {
  return { domain: 'orchidcontinuum.org', ...overrides };
}

describe('assessDomainPosture — read-only guarantee', () => {
  it('always reports read_only true', () => {
    const r = assessDomainPosture(base(), { now });
    expect(r.read_only).toBe(true);
  });
});

describe('SPF', () => {
  it('fails when absent', () => {
    const r = assessDomainPosture(base(), { now });
    expect(r.findings.find((f) => f.check === 'SPF')?.status).toBe('fail');
  });
  it('fails on +all', () => {
    const r = assessDomainPosture(base({ txt: ['v=spf1 +all'] }), { now });
    expect(r.findings.find((f) => f.check === 'SPF')?.status).toBe('fail');
  });
  it('passes with -all', () => {
    const r = assessDomainPosture(base({ txt: ['v=spf1 include:_spf.google.com -all'] }), { now });
    expect(r.findings.find((f) => f.check === 'SPF')?.status).toBe('pass');
  });
});

describe('DMARC', () => {
  it('fails when absent', () => {
    expect(
      assessDomainPosture(base(), { now }).findings.find((f) => f.check === 'DMARC')?.status,
    ).toBe('fail');
  });
  it('warns on p=none', () => {
    const r = assessDomainPosture(base({ dmarcTxt: ['v=DMARC1; p=none; rua=mailto:d@x'] }), { now });
    expect(r.findings.find((f) => f.check === 'DMARC')?.status).toBe('warn');
  });
  it('passes on p=reject with rua', () => {
    const r = assessDomainPosture(base({ dmarcTxt: ['v=DMARC1; p=reject; rua=mailto:d@x'] }), { now });
    expect(r.findings.find((f) => f.check === 'DMARC')?.status).toBe('pass');
  });
});

describe('DKIM — no guessing selectors', () => {
  it('reports unknown when no selectors configured', () => {
    const r = assessDomainPosture(base(), { now });
    const dkim = r.findings.find((f) => f.check === 'DKIM');
    expect(dkim?.status).toBe('unknown');
    expect(dkim?.guidance).toContain('not guessable');
  });
  it('checks configured selectors', () => {
    const r = assessDomainPosture(
      base({
        expectedDkimSelectors: ['s1', 's2'],
        dkim: { s1: ['v=DKIM1; k=rsa; p=MIGf...'] },
      }),
      { now },
    );
    expect(r.findings.find((f) => f.check === 'DKIM:s1')?.status).toBe('pass');
    expect(r.findings.find((f) => f.check === 'DKIM:s2')?.status).toBe('fail');
  });
});

describe('certificate + registration + dangling', () => {
  it('warns on soon-to-expire certificate', () => {
    const r = assessDomainPosture(base({ certificate: { daysRemaining: 5 } }), { now });
    expect(r.findings.find((f) => f.check === 'HTTPS certificate')?.status).toBe('warn');
  });
  it('flags dangling subdomain to decommissioned target', () => {
    const r = assessDomainPosture(
      base({
        cnames: { 'old.orchidcontinuum.org': 'ghost.herokuapp.com' },
        decommissionedTargets: ['ghost.herokuapp.com'],
      }),
      { now },
    );
    expect(r.findings.some((f) => f.check.startsWith('Dangling DNS'))).toBe(true);
  });
});

describe('overall status = worst finding', () => {
  it('is fail when any check fails', () => {
    const r = assessDomainPosture(base(), { now });
    expect(r.overall).toBe('fail');
  });
});
