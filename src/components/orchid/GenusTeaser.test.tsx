// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GenusTeaser from './GenusTeaser';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchPublicGenusImages: vi.fn(),
  fetchDailyGenus: vi.fn(),
}));

vi.mock('@/lib/publicImageSource', () => ({
  fetchPublicGenusImages: mocks.fetchPublicGenusImages,
}));

vi.mock('@/lib/genusData', async () => {
  const actual = await vi.importActual<typeof import('@/lib/genusData')>('@/lib/genusData');
  return {
    ...actual,
    fetchDailyGenus: mocks.fetchDailyGenus,
  };
});

describe('GenusTeaser', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders the specimen photo from the public image resolver', async () => {
    mocks.fetchDailyGenus.mockResolvedValue({
      genus: 'Masdevallia',
      family: 'Orchidaceae',
      tribe: 'Epidendreae',
      speciesCount: 350,
      regions: ['Andes'],
    });
    mocks.fetchPublicGenusImages.mockResolvedValue({
      images: [
        {
          scientific_name: 'Masdevallia veitchiana',
          image_url: 'https://photos.example/veitchiana.jpg',
          image_urls: ['https://photos.example/veitchiana.jpg'],
        },
      ],
      source: 'live',
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    let root!: Root;
    await act(async () => {
      root = createRoot(host);
      root.render(<GenusTeaser />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.fetchPublicGenusImages).toHaveBeenCalled();
    const img = host.querySelector('img');
    expect(img?.src).toBe('https://photos.example/veitchiana.jpg');
    expect(img?.alt).toBe('Masdevallia');
  });

  it('keeps the gradient fallback when the resolver returns no images', async () => {
    mocks.fetchDailyGenus.mockResolvedValue({
      genus: 'Masdevallia',
      family: 'Orchidaceae',
      tribe: 'Epidendreae',
      speciesCount: 350,
      regions: [],
    });
    mocks.fetchPublicGenusImages.mockResolvedValue({ images: [], source: 'pending' });

    const host = document.createElement('div');
    document.body.appendChild(host);
    let root!: Root;
    await act(async () => {
      root = createRoot(host);
      root.render(<GenusTeaser />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('Masdevallia');
  });
});
