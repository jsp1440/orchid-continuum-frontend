// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SpeciesPhotoGallery from './SpeciesPhotoGallery';
import { backboneTaxonId, type GalleryImage, type GalleryResponse } from './api';

vi.mock('@/lib/backendConfig', () => ({ CALYX_BACKEND_BASE_URL: 'https://calyx.test' }));

const NAME = 'Angraecum sesquipedale';

function photo(id: number, over: Partial<GalleryImage> = {}): GalleryImage {
  return {
    image_id: id,
    url: `https://img.test/${id}.jpg`,
    source_label: 'iNaturalist',
    licence: 'cc-by 4.0',
    licence_class: 'open_attribution',
    licence_name: 'CC BY 4.0',
    licence_url: 'https://creativecommons.org/licenses/by/4.0/',
    commercial_use: true,
    download: true,
    export: true,
    attribution: `Holder ${id}`,
    attribution_required: true,
    share_alike_notice: false,
    unmodified_only: false,
    identification: {
      verification: 'source_name',
      verification_label: "named by the image's own source",
      link_reason: 'exact',
      expert_verified: false,
    },
    ...over,
  };
}

function body(over: Partial<GalleryResponse> = {}): GalleryResponse {
  return {
    schema: 'oc.taxon-image-gallery.v1',
    taxon_key: 'taxon:32953',
    backbone_taxon_id: '32953',
    state: 'OK',
    unverified_shown: false,
    counts: {
      linked: 1,
      by_verification: {},
      cleared: 1,
      cleared_by_verification: {},
      displayable: 1,
      unverified_hidden: 0,
      withheld_by_reason: {},
    },
    counts_unavailable_reason: null,
    primary: photo(1),
    images: [photo(1)],
    page: { limit: 24, next_cursor: null },
    is_evidence_of_absence: false,
    ...over,
  };
}

type Reply = { status: number; json?: unknown } | Error;

function mockFetch(replies: Reply[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const reply = replies.shift();
      if (!reply) throw new Error(`unexpected fetch ${url}`);
      if (reply instanceof Error) throw reply;
      return {
        ok: reply.status >= 200 && reply.status < 300,
        status: reply.status,
        json: async () => reply.json,
      };
    }),
  );
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe('SpeciesPhotoGallery', () => {
  it('one photo: shows it large with credit and licence, and no grid', async () => {
    const calls = mockFetch([{ status: 200, json: body() }]);
    render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    const img = await screen.findByRole('img', { name: NAME });
    expect(img.getAttribute('src')).toBe('https://img.test/1.jpg');
    expect(screen.getByTestId('photo-count').textContent).toBe('1 photo we can show of 1 linked');
    expect(screen.getByText('Holder 1')).toBeTruthy();
    const deed = screen.getByRole('link', { name: 'CC BY 4.0' });
    expect(deed.getAttribute('href')).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(screen.getByText('named by the source')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /See all photos/ })).toBeNull();
    expect(calls[0]).toBe('https://calyx.test/api/knowledge-graph/taxon/32953/images?limit=24');
  });

  it('many photos: count line, See all photos grid with credits, and paging by cursor', async () => {
    const first = body({
      counts: { ...body().counts!, linked: 340, cleared: 30, displayable: 3 },
      primary: photo(2),
      images: [photo(1), photo(2)],
      page: { limit: 24, next_cursor: 'djE6Mg' },
    });
    const second = body({ primary: photo(2), images: [photo(3)], page: { limit: 24, next_cursor: null } });
    const calls = mockFetch([
      { status: 200, json: first },
      { status: 200, json: second },
    ]);
    render(<SpeciesPhotoGallery taxonId="taxon:32953" speciesName={NAME} />);
    await screen.findByRole('img', { name: NAME });
    expect(screen.getByTestId('photo-count').textContent).toBe('3 photos we can show of 340 linked');

    const toggle = screen.getByRole('button', { name: 'See all photos' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    const grid = screen.getByRole('list', { name: `Photos of ${NAME}` });
    // the primary first, then the page, without repeating the primary
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2);
    expect(within(grid).getByText('Holder 1')).toBeTruthy();
    expect(within(grid).getAllByRole('link', { name: 'CC BY 4.0' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Show more photos' }));
    await waitFor(() => expect(within(grid).getAllByRole('listitem')).toHaveLength(3));
    expect(within(grid).getByRole('img', { name: `${NAME}, photo 3` })).toBeTruthy();
    expect(calls[1]).toBe('https://calyx.test/api/knowledge-graph/taxon/taxon%3A32953/images?limit=24&cursor=djE6Mg');
    expect(screen.queryByRole('button', { name: 'Show more photos' })).toBeNull();
  });

  it('never renders observer, locality or coordinate fields, even when the payload carries them', async () => {
    const leaky = {
      ...photo(1),
      observer_name: 'Jane Observer',
      locality: 'Secret Ridge Trail',
      latitude: -18.91234,
      longitude: 47.53456,
      coordinates: '-18.91234, 47.53456',
      event_date: '2021-04-02',
    } as unknown as GalleryImage;
    const leakyBody = {
      ...body({ primary: leaky, images: [leaky, { ...leaky, image_id: 9 }] }),
      observer: 'Jane Observer',
      locality: 'Secret Ridge Trail',
    } as unknown as GalleryResponse;
    mockFetch([{ status: 200, json: leakyBody }]);
    const { container } = render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    await screen.findByRole('img', { name: NAME });
    fireEvent.click(screen.getByRole('button', { name: 'See all photos' }));
    fireEvent.click(screen.getByRole('button', { name: `Open larger view of photo 2 of ${NAME}` }));
    await screen.findByRole('dialog');
    const text = `${container.textContent} ${document.body.textContent}`;
    for (const leaked of ['Jane Observer', 'Secret Ridge', '18.91234', '47.53456', '2021-04-02']) {
      expect(text).not.toContain(leaked);
    }
    expect(document.body.innerHTML).not.toContain('Jane Observer');
  });

  it('a non-commercial image is shown with credit and licence but has no download link', async () => {
    const nc = photo(5, {
      licence: 'CC BY-NC 4.0',
      licence_class: 'noncommercial',
      licence_name: 'CC BY-NC 4.0',
      licence_url: 'https://creativecommons.org/licenses/by-nc/4.0/',
      commercial_use: false,
      download: false,
      export: false,
      attribution: 'NC Rights Holder',
    });
    mockFetch([{ status: 200, json: body({ primary: nc, images: [nc, photo(6)] }) }]);
    const { container } = render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    await screen.findByRole('img', { name: NAME });
    expect(screen.getAllByText('NC Rights Holder').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'CC BY-NC 4.0' })).toBeTruthy();
    expect(screen.getByText(/not for download or reuse/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See all photos' }));
    fireEvent.click(screen.getByRole('button', { name: `Open larger view of photo 1 of ${NAME}` }));
    await screen.findByRole('dialog');
    const anchors = [...container.querySelectorAll('a'), ...document.body.querySelectorAll('a')];
    for (const a of anchors) {
      expect(a.hasAttribute('download')).toBe(false);
      expect(a.getAttribute('href')).not.toMatch(/img\.test/);
    }
    expect(screen.queryByText(/download$/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /download|save/i })).toBeNull();
  });

  it('route off (404): renders nothing', async () => {
    const calls = mockFetch([{ status: 404, json: { detail: 'not_enabled' } }]);
    const { container } = render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('5xx: says the photos are unavailable, a gap, not an absence', async () => {
    mockFetch([{ status: 503, json: { detail: 'Unable to read the taxon\'s images' } }]);
    render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    expect(await screen.findByText('Photos are unavailable right now.')).toBeTruthy();
  });

  it('network failure: the same quiet gap message', async () => {
    mockFetch([new TypeError('Failed to fetch')]);
    render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    expect(await screen.findByText('Photos are unavailable right now.')).toBeTruthy();
  });

  it('linked but none cleared: a short note; nothing linked: nothing', async () => {
    const withheld = body({
      state: 'ALL_WITHHELD',
      counts: { ...body().counts!, linked: 12, cleared: 0, displayable: 0 },
      primary: null,
      images: [],
    });
    mockFetch([{ status: 200, json: withheld }]);
    render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    expect(await screen.findByText('No licence-cleared photos yet.')).toBeTruthy();
    cleanup();

    const none = body({
      state: 'NONE_LINKED',
      counts: { ...body().counts!, linked: 0, cleared: 0, displayable: 0 },
      primary: null,
      images: [],
    });
    const calls = mockFetch([{ status: 200, json: none }]);
    const { container } = render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('keyboard: opens the larger view from a thumbnail, arrows move, Escape closes and focus returns', async () => {
    mockFetch([{ status: 200, json: body({ images: [photo(1), photo(2)] }) }]);
    render(<SpeciesPhotoGallery taxonId="32953" speciesName={NAME} />);
    await screen.findByRole('img', { name: NAME });
    fireEvent.click(screen.getByRole('button', { name: 'See all photos' }));
    const thumb = screen.getByRole('button', { name: `Open larger view of photo 2 of ${NAME}` });
    thumb.focus();
    // a native button activates on Enter/Space; the browser turns that into a click
    fireEvent.keyDown(thumb, { key: 'Enter' });
    fireEvent.click(thumb);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`${NAME} — photo 2 of 2`)).toBeTruthy();
    expect(within(dialog).getByRole('img', { name: `${NAME}, photo 2` })).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(within(dialog).getByText(`${NAME} — photo 1 of 2`)).toBeTruthy();

    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(thumb));
  });
});

describe('backboneTaxonId', () => {
  it('accepts backbone ids and keys, refuses anything else', () => {
    expect(backboneTaxonId('taxon:32953')).toBe('32953');
    expect(backboneTaxonId('32953')).toBe('32953');
    expect(backboneTaxonId('taxon:implied:angraecum_foo')).toBe('implied:angraecum_foo');
    expect(backboneTaxonId('calyx:12')).toBeNull();
    expect(backboneTaxonId('')).toBeNull();
    expect(backboneTaxonId(null)).toBeNull();
  });
});
