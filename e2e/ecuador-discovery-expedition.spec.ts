import { expect, test } from '@playwright/test';

const governedPath = '/rest/v1/atlas_occurrences_public';
const journeyPath = '/atlas-next?expedition=ecuador';
const localKey = 'orchid-continuum.ecuador-passport.v1';
const fixture = {
  country: 'Ecuador', verified: true, locality_withheld: false,
  published_precision_reason: 'exact', habitat: 'Cloud forest', elevation_m: 2340, source_dataset: 'GBIF',
};
const rows = [
  { ...fixture, accepted_name: 'Epidendrum radicans', genus: 'Epidendrum' },
  { ...fixture, accepted_name: 'Lepanthes telipogoniflora', genus: 'Lepanthes', habitat: null },
  { ...fixture, accepted_name: 'Pleurothallis restrepioides', genus: 'Pleurothallis', elevation_m: null },
  { ...fixture, accepted_name: 'Dracula vampira', genus: 'Dracula', locality_withheld: true, published_precision_reason: 'threatened' },
];

// Provider-free acceptance fixtures. None of these rows establishes a real occurrence.
test('Ecuador expedition guides three records into a private Passport and Research Mode', async ({ page }) => {
  const occurrenceRequests: URL[] = [];
  await page.route(`**${governedPath}?*`, (route) => route.fulfill({ json: rows }));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Begin Discovery Expedition' }).press('Enter');
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(journeyPath);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('atlas_occurrences') || url.pathname.includes('/atlas/occurrences')) {
      occurrenceRequests.push(url);
    }
  });
  await page.getByRole('button', { name: 'Orchids of Ecuador', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Atlas globe centered on Ecuador' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dracula vampira' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Epidendrum radicans' }).click();
  await expect(page.getByRole('region', { name: 'Species card for Epidendrum radicans' })).toContainText('2000–2499 m');

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Save species to Orchid Explorer Passport' }).click();
    const prompt = page.getByRole('textbox', { name: 'What did you notice about where this orchid grows?' });
    if (index === 0) {
      await prompt.fill('2.123, -3');
      await page.getByRole('button', { name: 'Save observation' }).click();
      await expect(page.getByRole('alert')).toContainText('without coordinates');
    }
    await prompt.fill(`The record describes a wet forest environment. Visit ${index + 1}.`);
    await page.getByRole('button', { name: 'Save observation' }).click();
    await expect(page.getByText('Award earned · First Scientific Observation')).toBeVisible();
    if (index < 2) await page.getByRole('button', { name: 'Continue to next species' }).click();
  }
  await page.getByRole('button', { name: 'Finish expedition' }).click();
  await expect(page.getByRole('heading', { name: 'Observation is the first step' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to Research Mode' })).toHaveAttribute('href', '/research');
  await expect(page.getByRole('link', { name: 'Practise the scientific method' })).toHaveAttribute('href', '/classroom/investigation');

  await page.reload();
  await page.getByRole('button', { name: 'Orchids of Ecuador', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Orchid Explorer Passport' })).toContainText('Visit 1.');
  const stored = await page.evaluate((key) => localStorage.getItem(key), localKey);
  expect(stored).not.toContain('2.123');
  expect(stored).not.toMatch(/locality|latitude|longitude|elevation|source_dataset/);
  expect(occurrenceRequests.length).toBeGreaterThan(0);
  for (const url of occurrenceRequests) {
    expect(url.pathname).toBe(governedPath);
    expect(url.searchParams.get('country')).toBe('ilike.Ecuador');
    expect(url.searchParams.get('locality_withheld')).toBe('eq.false');
    expect(url.searchParams.get('select')).not.toMatch(/(?:^|,)(lat|lng|locality|source_record_id)(?:$|,)/);
  }
});

test('a missing governed source produces no fallback or demonstration records', async ({ page }) => {
  let governedReads = 0;
  const otherOccurrenceReads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path !== governedPath && /atlas_occurrences|\/atlas\/occurrences/.test(path)) otherOccurrenceReads.push(path);
  });
  await page.route(`**${governedPath}?${'*'}`, (route) => {
    governedReads += 1;
    return route.fulfill({ status: 404, json: { code: 'PGRST205' } });
  });
  // Bookmarked legacy tour enters the same first-party experience.
  await page.goto('/atlas/ecuador', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(journeyPath);
  await page.getByRole('button', { name: 'Orchids of Ecuador', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No demonstration records are shown');
  await expect(page.getByRole('button', { name: 'Save species to Orchid Explorer Passport' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => governedReads).toBe(2);
  expect(otherOccurrenceReads).toEqual([]);
});
