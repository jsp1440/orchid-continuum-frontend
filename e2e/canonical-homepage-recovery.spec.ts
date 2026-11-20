import { expect, test } from '@playwright/test';

const fixturePhoto = 'https://inaturalist-open-data.s3.amazonaws.com/photos/123/featured-orchid.png';
const fixturePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kvhoAAAAASUVORK5CYII=',
  'base64',
);

const destinations = [
  '/atlas-next', '/conservation', '/orchid-identification',
  '/research', '/conservatory', '/species',
  '/intelligence-graph', '/university', '/speak-with-calyx',
];

test('restored homepage shows the licensed hero and nine working destinations', async ({ page }) => {
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort();
  });
  await page.route(fixturePhoto, (route) => route.fulfill({ contentType: 'image/png', body: fixturePng }));
  await page.route('**/api/media/genus/**', (route) => {
    const url = new URL(route.request().url());
    const genus = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    return route.fulfill({
      json: {
        status: 'ok', requested_genus: genus, accepted_genus: genus,
        items: [{
          media_id: 'specimen-photo-fixture', taxon_id: null,
          genus, scientific_name: `${genus} testii`,
          image_url: 'https://sweetgum.nybg.org/specimen.jpg',
          source_name: 'Herbarium fixture', media_kind: 'photograph',
          license: 'cc-by', attribution: 'Specimen photographer',
        }, {
          media_id: 'homepage-photo-fixture', taxon_id: null,
          genus, scientific_name: `${genus} testii`, image_url: fixturePhoto,
          thumbnail_url: fixturePhoto, source_name: 'Fixture photo library',
          media_kind: 'photograph', license: 'http://creativecommons.org/licenses/by/4.0/',
          attribution: 'Fixture photographer',
        }],
      },
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const expedition = page.getByRole('link', { name: 'Begin Discovery Expedition' });
  const introduction = page.getByRole('heading', { name: 'Discover the extraordinary world of orchids', level: 1 });
  const viewport = page.viewportSize()!;
  for (const size of [viewport, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await expect(introduction).toBeInViewport();
    await expect(expedition).toBeInViewport();
  }
  await page.setViewportSize(viewport);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(expedition).toHaveAttribute('href', '/atlas-next?expedition=ecuador');
  await expedition.focus();
  await expect(expedition).toBeFocused();
  await expedition.press('Enter');
  await expect(page).toHaveURL(/\/atlas-next\?expedition=ecuador$/);
  await page.goBack({ waitUntil: 'domcontentloaded' });

  const hero = page.getByRole('region', { name: /^Featured orchid:/ });
  const photograph = hero.getByRole('img');
  await expect(photograph).toBeVisible();
  await expect.poll(() => photograph.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(hero.getByRole('link', { name: 'Creative Commons terms' }))
    .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  await expect(hero).toContainText('Photographer: Fixture photographer');
  await expect(page.getByText('Knowledge Graph', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'About Orchid Continuum', exact: true })).toHaveAttribute('href', '/about');

  const grid = page.getByRole('region', { name: 'Explore Orchid Continuum' });
  const links = grid.getByRole('link');
  await expect(links).toHaveCount(9);
  await expect(grid.getByRole('link', { name: /^Intelligence Graph/ })).toHaveAttribute('href', '/intelligence-graph');
  expect(await links.evaluateAll((items) => items.map((item) => item.getAttribute('href')))).toEqual(destinations);
  const columns = await links.first().evaluate((link) => getComputedStyle(link.parentElement!).gridTemplateColumns);
  expect(columns.split(' ')).toHaveLength(3);

  for (const destination of destinations) {
    await grid.locator(`a[href="${destination}"]`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(destination);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(grid).toBeVisible();
  }
});
