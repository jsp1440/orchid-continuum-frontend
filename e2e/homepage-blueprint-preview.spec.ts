import { expect, test } from '@playwright/test';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kvhoAAAAASUVORK5CYII=', 'base64');
for (const viewport of [{ width: 1366, height: 1024 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  test(`homepage blueprint preview selection and Atlas continuity at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const host = new URL(route.request().url()).hostname;
      return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort();
    });
    await page.route('https://example.org/*.png', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.route('**/api/media/genus/**', route => {
      const genus = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
      return route.fulfill({ json: { status: 'ok', requested_genus: genus, accepted_genus: genus, items: ['alba', 'bella', 'caudata', 'densa', 'exigua', 'flava', 'gracilis', 'hirtzii', 'ignea', 'jucunda', 'kimballiana', 'lenta'].map((name, index) => ({
        media_id: String(index), genus, scientific_name: `${genus} ${name}`, image_url: `https://example.org/${name}.png`, thumbnail_url: `https://example.org/${name}.png`, source_name: 'Test fixture; not scientific evidence', source_record_url: `https://example.org/records/${name}`, license: 'CC BY 4.0', attribution: `Test photographer ${name}`, media_kind: 'photograph',
        ...(name === 'bella' ? { license: 'CC BY-ND 4.0', licence_url: 'https://creativecommons.org/licenses/by-nd/4.0/', unmodified_only: true } : { unmodified_only: false }),
      })) } });
    });
    await page.goto('/homepage-recovery-preview');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover the hidden relationships');
    if (viewport.width < 1280) await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeVisible();
    const exhibit = page.locator('#featured-genus');
    await expect(exhibit.locator('.recovery-species-grid button')).toHaveCount(9);
    await exhibit.getByRole('button', { name: /Study .* bella$/ }).click();
    await expect(exhibit.locator('figure img')).toHaveAttribute('src', 'https://example.org/bella.png');
    await expect(exhibit.locator('figure img')).toHaveCSS('object-fit', 'contain');
    await expect(exhibit.getByRole('button', { name: /Study .* bella$/ }).locator('img')).toHaveCSS('object-fit', 'contain');
    await expect(exhibit.getByRole('link', { name: 'CC BY-ND 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-nd/4.0/');
    await expect(exhibit.locator('figcaption')).toContainText('Test photographer bella');
    await expect(exhibit.getByRole('link', { name: 'Original source record ↗' })).toHaveAttribute('href', 'https://example.org/records/bella');
    const selectedName = (await exhibit.locator('figcaption h3').innerText()).trim();
    const subject = encodeURIComponent(selectedName);
    await expect(exhibit.getByRole('link', { name: `Species dossier for ${selectedName}` })).toHaveAttribute('href', `/species/${subject}?name=${subject}`);
    for (let i = 0; i < 9; i++) await exhibit.getByRole('button', { name: 'Next species', exact: true }).click();
    await expect(exhibit.locator('figure img')).toHaveAttribute('src', 'https://example.org/kimballiana.png');
    const genus = (await exhibit.locator('h2').innerText()).trim();
    const atlas = page.locator('#living-atlas');
    await expect(atlas.getByRole('heading', { level: 3 })).toContainText(genus);
    await expect(atlas.getByRole('link', { name: 'Open the Atlas workspace ↗' })).toHaveAttribute('href', `/atlas-next?genera=${genus}`);
    await atlas.getByRole('button', { name: '2D map', exact: true }).click();
    await expect(atlas.getByRole('button', { name: '2D map', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('offers a truthful fallback when WebGL is unavailable', async ({ page }) => {
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function(contextId: string, ...args: unknown[]) {
      return contextId.includes('webgl') ? null : Reflect.apply(original, this, [contextId, ...args]);
    } });
  });
  await page.goto('/homepage-recovery-preview');
  const atlas = page.locator('#living-atlas');
  await atlas.scrollIntoViewIfNeeded();
  await expect(atlas.getByRole('status').filter({ hasText: 'This device could not display the globe' })).toBeVisible();
  await atlas.getByRole('button', { name: '2D map', exact: true }).click();
  await expect(atlas.getByRole('button', { name: '2D map', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
