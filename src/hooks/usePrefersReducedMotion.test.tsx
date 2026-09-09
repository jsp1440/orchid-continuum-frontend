import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AtlasFilterPanel from '@/components/atlas/AtlasFilterPanel';
import { getReducedMotionPreference } from './usePrefersReducedMotion';

describe('Atlas accessibility contracts', () => {
  it('reads the operating-system reduced-motion preference', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(getReducedMotionPreference(matchMedia)).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('fails safely when matchMedia is unavailable', () => {
    expect(getReducedMotionPreference(undefined)).toBe(false);
  });

  it('labels the Atlas filter region and every filter control', () => {
    const html = renderToStaticMarkup(
      <AtlasFilterPanel filters={{}} onChange={() => undefined} onReset={() => undefined} />,
    );

    expect(html).toContain('aria-label="Atlas filters"');
    expect(html).toContain('aria-label="Reset Atlas filters"');

    for (const [label, id] of [
      ['Genus', 'atlas-filter-genus'],
      ['Species', 'atlas-filter-species'],
      ['Country', 'atlas-filter-country'],
      ['Biome', 'atlas-filter-biome'],
    ]) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`>${label}</label>`);
    }

    for (const label of [
      'Minimum elevation (m)',
      'Maximum elevation (m)',
      'Start year',
      'End year',
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
