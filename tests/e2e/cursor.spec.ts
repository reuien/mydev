import { expect, test } from '@playwright/test';

test('optical cursor follows both axes, reacts to links, and cleans up', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Fine pointer enhancement only');
  await page.goto('/');
  const cursor = page.locator('.optical-cursor:not(.optical-echo)');
  await expect(cursor).toHaveCount(1);
  await expect(cursor).toHaveAttribute('aria-hidden', 'true');
  expect(await cursor.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.mouse.move(100, 200);
  await expect(cursor).not.toHaveClass(/-hidden/);
  await expect.poll(() => cursor.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeCloseTo(100, 0);
  await page.mouse.move(500, 200);
  await expect.poll(() => cursor.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeCloseTo(500, 0);
  await page.mouse.move(500, 400);
  await expect.poll(() => cursor.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42)).toBeCloseTo(400, 0);
  const link = page.getByRole('link', { name: 'Projects', exact: true });
  const box = (await link.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(cursor).toHaveClass(/-pointer/);
  await page.mouse.down();
  await expect(cursor).toHaveClass(/-active/);
  await page.mouse.move(20, 200);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.optical-cursor')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.optical-cursor')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.optical-cursor')).toHaveCount(2);
});

test('reduced motion and touch retain native pointing', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.optical-cursor')).toHaveCount(0);
  if (testInfo.project.name === 'mobile-chromium') {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    await expect(page.locator('.optical-cursor')).toHaveCount(0);
  }
});
