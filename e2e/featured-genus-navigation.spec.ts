import { expect, test } from '@playwright/test';

test('visitors can open the rotating genus gallery from home and return to the genus panel', async ({ page }) => {
  await page.route('**/*', route => {
    const { hostname } = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(hostname) ? route.continue() : route.abort();
  });
  await page.goto('/');
  const genus = page.locator('#featured-genus-title');
  const name = (await genus.innerText()).trim();
  await page.getByRole('link', { name: 'Explore the species gallery' }).click();
  await expect(page).toHaveURL(/\/homepage-recovery-preview#featured-genus$/);
  await expect(page.locator('#featured-heading')).toHaveText(name);
  await expect(page.locator('#featured-heading')).toBeInViewport();

  await page.getByRole('contentinfo').getByRole('button', { name: 'Featured Genus' }).click();
  await expect(page).toHaveURL(/\/#species-in-focus$/);
  await expect(genus).toBeInViewport();
});
