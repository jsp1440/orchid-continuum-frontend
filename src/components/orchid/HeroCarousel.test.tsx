// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeroCarousel from './HeroCarousel';
import { fetchPublicGenusImages } from '@/lib/publicImageSource';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PHOTO = 'https://photos.example/masdevallia-veitchiana.jpg';
const PHOTO2 = 'https://photos.example/masdevallia-strobelii.jpg';

function stubImageLifecycle(complete: boolean, naturalWidth: number) {
  const completeSpy = vi
    .spyOn(HTMLImageElement.prototype, 'complete', 'get')
    .mockReturnValue(complete);
  const widthSpy = vi
    .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
    .mockReturnValue(naturalWidth);
  return () => {
    completeSpy.mockRestore();
    widthSpy.mockRestore();
  };
}

async function renderCarousel(props: {
  urls: string[];
  onActiveUrlChange?: (url: string | null) => void;
}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root!: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <HeroCarousel urls={props.urls} genus="Masdevallia" onActiveUrlChange={props.onActiveUrlChange} />,
    );
  });
  return { host, root };
}

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('HeroCarousel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('marks a warm-cache image loaded without waiting for onLoad', async () => {
    // Regression: a cached image can finish decoding before React attaches the
    // synthetic onLoad, leaving the shimmer up forever. The ref callback reads
    // img.complete at commit time instead.
    stubImageLifecycle(true, 800);
    const onActive = vi.fn();
    const { host } = await renderCarousel({ urls: [PHOTO], onActiveUrlChange: onActive });
    await tick();

    expect(onActive).toHaveBeenCalledWith(PHOTO);
    expect(host.textContent).not.toContain('Loading featured photograph');
    const img = host.querySelector('img')!;
    expect(img.style.opacity).toBe('1');
  });

  it('still reveals an uncached image via its load event', async () => {
    const restore = stubImageLifecycle(false, 0);
    const onActive = vi.fn();
    const { host } = await renderCarousel({ urls: [PHOTO], onActiveUrlChange: onActive });

    expect(host.textContent).toContain('Loading featured photograph');
    restore();
    stubImageLifecycle(true, 800);
    const img = host.querySelector('img')!;
    await act(async () => {
      img.dispatchEvent(new Event('load'));
    });
    await tick();

    expect(onActive).toHaveBeenCalledWith(PHOTO);
    expect(host.textContent).not.toContain('Loading featured photograph');
  });

  it('shows the honest empty state when every candidate fails', async () => {
    stubImageLifecycle(false, 0);
    const { host } = await renderCarousel({ urls: [PHOTO, PHOTO2] });

    const imgs = host.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    await act(async () => {
      imgs.forEach((img) => img.dispatchEvent(new Event('error')));
    });
    await tick();

    expect(host.textContent).toContain('No approved photograph yet for Masdevallia');
  });

  it('reports a fully-failed cached image as failed at commit time', async () => {
    stubImageLifecycle(true, 0);
    const { host } = await renderCarousel({ urls: [PHOTO] });
    await tick();

    expect(host.textContent).toContain('No approved photograph yet for Masdevallia');
  });
});

describe('fetchPublicGenusImages care-icon filtering', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('drops orchidspecies care-condition icons from photograph candidates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          images: [
            {
              scientific_name: 'Masdevallia veitchiana',
              image_url: 'https://www.orchidspecies.com/orphotdir/partialshade.jpg',
            },
            {
              scientific_name: 'Masdevallia veitchiana',
              image_url: PHOTO,
            },
            {
              scientific_name: 'Masdevallia strobelii',
              image_url: PHOTO2,
            },
          ],
        }),
      })),
    );

    const { images, source } = await fetchPublicGenusImages('Masdevallia');
    expect(source).toBe('live');
    const allUrls = images.flatMap((i) => i.image_urls);
    expect(allUrls.every((u) => !/photdir\//i.test(u))).toBe(true);
    expect(allUrls).toContain(PHOTO);
    expect(allUrls).toContain(PHOTO2);
  });
});
