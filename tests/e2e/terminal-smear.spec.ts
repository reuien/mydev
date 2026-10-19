import { expect, test } from '@playwright/test';

for (const reduceMotion of [false, true]) {
  test(`terminal cursor trail ${reduceMotion ? 'respects reduced motion' : 'animates and settles'}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduceMotion ? 'reduce' : 'no-preference' });
    await page.goto('/');
    const terminal = page.locator('iframe[title="MyDev terminal blog"]').contentFrame();
    const input = terminal.locator('.xterm-helper-textarea');
    await expect.poll(() => input.evaluate((element) =>
      (element.ownerDocument.defaultView as Window & { __booted?: boolean }).__booted,
    )).toBe(true);
    const trail = terminal.locator('.terminal-cursor-smear');
    await expect(trail).toHaveCount(1);
    await expect(trail).toHaveAttribute('aria-hidden', 'true');
    expect(await trail.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
    await input.pressSequentially('smear-demo', { delay: 24 });
    if (!reduceMotion) {
      await expect(trail).toHaveAttribute('data-active', 'true');
      const painted = await trail.evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.some((value, index) => index % 4 === 3 && value > 0);
      });
      expect(painted).toBe(true);
    }
    await expect(trail).toHaveAttribute('data-active', 'false');
    await input.press('Control+c');
    await expect(trail).toHaveAttribute('data-active', 'false');
    if (!reduceMotion) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await input.pressSequentially('still-typing', { delay: 16 });
      await expect(trail).toHaveAttribute('data-active', 'false');
    }
  });
}

test('terminal mouse trail settles without intercepting input', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Touch has no mouse trail');
  await page.goto('/');
  const terminal = page.locator('iframe[title="MyDev terminal blog"]').contentFrame();
  const trail = terminal.locator('.terminal-cursor-smear');
  await expect(trail).toBeAttached();
  const bounds = (await trail.boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + 30);
  await page.mouse.move(bounds.x + 150, bounds.y + 100, { steps: 8 });
  await expect(trail).toHaveAttribute('data-active', 'true');
  await expect(trail).toHaveAttribute('data-active', 'false');
});
