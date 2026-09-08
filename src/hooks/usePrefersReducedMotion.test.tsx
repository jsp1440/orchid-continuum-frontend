import { render, screen } from '@testing-library/react';
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
    render(
      <AtlasFilterPanel filters={{}} onChange={() => undefined} onReset={() => undefined} />,
    );

    expect(screen.getByRole('complementary', { name: 'Atlas filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Atlas filters' })).toBeInTheDocument();
    for (const label of ['Genus', 'Species', 'Country', 'Minimum elevation (m)', 'Maximum elevation (m)', 'Start year', 'End year', 'Biome']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});
