import { expect, test } from '@playwright/test';

test('optical cursor follows both axes, reacts to links, and cleans up', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Fine pointer enhancement only');
  await page.goto('/blog');
  const cursor = page.locator('.optical-cursor:not(.optical-echo)');
  await expect(cursor).toHaveCount(1);
  await expect(cursor).toHaveAttribute('aria-hidden', 'true');
  expect(await cursor.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.mouse.move(100, 200);
  await expect(cursor).not.toHaveClass(/-hidden/);
  await expect.poll(() => cursor.evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41 - 100))).toBeLessThan(5);
  await page.mouse.move(500, 200);
  await expect.poll(() => cursor.evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41 - 500))).toBeLessThan(5);
  await page.mouse.move(500, 400);
  await expect.poll(() => cursor.evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).m42 - 400))).toBeLessThan(5);
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
  await expect(page.locator('.comet-trail')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.optical-cursor')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.optical-cursor')).toHaveCount(1);
});

test('comet wake appears on movement and clears after stopping', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Fine pointer enhancement only');
  await page.goto('/blog');
  const trail = page.locator('.comet-trail');
  await expect(trail).toHaveCount(1);
  const painted = () => trail.evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return true;
    return false;
  });
  // Stay in the non-interactive gutter and sample during animation frames:
  // a burst of mouse events can otherwise finish before the trail is drawn.
  await page.mouse.move(20, 150);
  let appeared = false;
  for (let step = 1; step <= 24 && !appeared; step++) {
    await page.mouse.move(20, 150 + step * 15);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    appeared = await painted();
  }
  expect(appeared).toBe(true);
  await expect.poll(painted).toBe(false);
  await page.reload();
  await expect(trail).toHaveCount(1);
});

test('reduced motion and touch retain native pointing', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/blog');
  await expect(page.locator('.optical-cursor')).toHaveCount(0);
  if (testInfo.project.name === 'mobile-chromium') {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    await expect(page.locator('.optical-cursor')).toHaveCount(0);
  }
});
