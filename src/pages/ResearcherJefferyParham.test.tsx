// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { matchPath } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResearcherJefferyParham from './ResearcherJefferyParham';
import { renderProfileDocument } from '../../scripts/render-researcher-profile';
import { researchStationProfile as profile } from '../content/researchStationProfile';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const staticHtml = read('public/researcher-jeffery-scott-parham.html');
const staticDocument = new DOMParser().parseFromString(staticHtml, 'text/html');
const routes = ['/research-station', '/research-station/about', profile.canonicalPath];

afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; document.body.innerHTML = ''; });

describe('Research Station public verification profile', () => {
  it('ships the exact shared content as crawlable HTML with no application scripts', () => {
    expect(staticHtml).toBe(renderProfileDocument());
    expect(staticDocument.documentElement.lang).toBe('en');
    expect(staticDocument.querySelectorAll('h1')).toHaveLength(1);
    expect(staticDocument.querySelector('h1')?.textContent).toContain(profile.name);
    expect(staticDocument.querySelector('main')?.textContent).toContain('M.S., Plant Pathology');
    expect(staticDocument.querySelectorAll('script:not([type="application/ld+json"])')).toHaveLength(0);
    expect(staticDocument.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('/research-station-profile.css');
  });

  it('serves all public routes ahead of SPA fallbacks and preserves member protection', () => {
    const app = read('src/App.tsx');
    const { rewrites } = JSON.parse(read('vercel.json'));
    const fallback = rewrites.findIndex((rule: { destination: string }) => rule.destination === '/index.html');
    const redirects = read('public/_redirects').trim().split('\n');
    for (const route of routes) {
      expect(app).toContain(`path="${route}" element={<ResearcherJefferyParham />}`);
      const index = rewrites.findIndex((rule: { source: string }) => rule.source === route);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(fallback);
      expect(rewrites[index].destination).toBe('/researcher-jeffery-scott-parham.html');
      for (const suffix of ['', '/']) {
        const line = redirects.indexOf(`${route}${suffix} /researcher-jeffery-scott-parham.html 200`);
        expect(line).toBeGreaterThanOrEqual(0);
        expect(line).toBeLessThan(redirects.indexOf('/* /index.html 200'));
      }
    }
    expect(app).toMatch(/path="\/research" element=\{<ProtectedRoute/);
    expect(staticDocument.querySelector('a[href="/research"]')?.textContent).toContain('Sign-in required');
  });

  it('provides canonical identity metadata without invented appointments or identifiers', () => {
    expect(staticDocument.title).toBe(profile.title);
    expect(staticDocument.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(profile.canonicalUrl);
    const data = JSON.parse(staticDocument.querySelector('script')!.textContent!);
    const person = data['@graph'].find((node: { '@type': string }) => node['@type'] === 'Person');
    expect(person.name).toBe(profile.name);
    expect(person.jobTitle).toBe(profile.role);
    expect(person).not.toHaveProperty('worksFor');
    expect(person).not.toHaveProperty('award');
    expect(person).not.toHaveProperty('identifier');
    expect(data['@graph'][0].mainEntity['@id']).toBe(person['@id']);
  });

  it('limits public contact to the verified society office and excludes sensitive contact fields', () => {
    const emails = staticHtml.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    expect(new Set(emails)).toEqual(new Set([profile.contactEmail]));
    expect(staticDocument.querySelectorAll('a[href^="tel:"], a[href^="sms:"], address')).toHaveLength(0);
    // Do not reproduce private values in regression fixtures or failure messages.
    const privatePatterns = [
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/,
      /\b\d{2}-\d{7}\b/,
      /\b\d{1,6}\s+[A-Z][A-Za-z .'-]+\s(?:Street|St|Road|Rd|Lane|Ln|Drive|Dr|Avenue|Ave|Court|Ct|Boulevard|Blvd)\b/i,
      /"(?:telephone|streetAddress|postalCode|taxID|geo|latitude|longitude)"\s*:/,
    ];
    for (const pattern of privatePatterns) expect(pattern.test(staticHtml)).toBe(false);
    expect(staticHtml).not.toMatch(/fcosorchids\.org|B\.S\.|B\.A\.|M\.A\./);
  });

  it('separates proposed work from active development and links verifiable organizations', () => {
    const proposals = staticDocument.querySelector('#proposals')!;
    expect(proposals.textContent).toContain('No submission, funding award, or completed research outcome is claimed');
    expect(proposals.querySelectorAll('article')).toHaveLength(2);
    expect(proposals.textContent).toContain('Proposal in development');
    expect(proposals.textContent).toContain('2026 NHOS');
    expect(staticDocument.querySelector(`a[href="${profile.societyUrl}"]`)).not.toBeNull();
    expect(staticDocument.querySelector(`a[href="${profile.sponsorUrl}"]`)).not.toBeNull();
    const app = read('src/App.tsx');
    const routePaths = Array.from(app.matchAll(/<Route\s+path="([^"]+)"/g), match => match[1]).filter(path => path !== '*');
    for (const anchor of staticDocument.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
      const pathname = anchor.getAttribute('href')!.split('#')[0];
      expect(routePaths.some(path => matchPath({ path, end: true }, pathname)), pathname).toBe(true);
    }
    for (const anchor of staticDocument.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(staticDocument.querySelector(anchor.getAttribute('href')!)).not.toBeNull();
    }
  });

  it('renders the same public page without providers and restores head metadata on exit', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const fetchSpy = vi.fn(() => { throw new Error('Public profile must not call providers'); });
    vi.stubGlobal('fetch', fetchSpy);
    document.head.innerHTML = '<title>Original</title><meta name="description" content="Original description"><link rel="canonical" href="https://example.test/original">';
    const originalHead = document.head.innerHTML;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<React.StrictMode><ResearcherJefferyParham /></React.StrictMode>); });
    expect(container.querySelector('main')?.innerHTML).toBe(staticDocument.querySelector('main')?.innerHTML);
    expect(document.title).toBe(profile.title);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(profile.canonicalUrl);
    expect(container.querySelector('.rs-skip')?.getAttribute('href')).toBe('#profile-main');
    expect(container.querySelector('#profile-main')?.getAttribute('tabindex')).toBe('-1');
    act(() => { root.unmount(); });
    expect(document.head.innerHTML).toBe(originalHead);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
