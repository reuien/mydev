import { expect, test } from '@playwright/test';

for (const command of ['blog', 'open blog']) {
  test(`terminal command "${command}" opens the blog successfully`, async ({ page }) => {
    await page.goto('/');
    const terminal = page.locator('iframe[title="MyDev terminal blog"]').contentFrame();
    const input = terminal.locator('.xterm-helper-textarea');
    await expect.poll(() => input.evaluate((element) =>
      (element.ownerDocument.defaultView as Window & { __booted?: boolean }).__booted,
    )).toBe(true);
    await input.pressSequentially(command);
    const response = page.waitForResponse((response) => new URL(response.url()).pathname === '/blog');
    await input.press('Enter');
    expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByRole('heading', { name: 'Writing', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Signal lost.' })).toHaveCount(0);
  });
}
