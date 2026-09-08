import { expect, test } from '@playwright/test';

test('unpublished and missing article URLs share the same visitor experience', async ({ page }) => {
  const draft = await page.goto('/blog/draft-only-fixture');
  expect(draft?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Not found.' })).toBeVisible();
  await page.goto('/blog');
  await expect(page.getByText('draft-only-fixture')).toHaveCount(0);
});
