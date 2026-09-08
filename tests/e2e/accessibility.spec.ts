import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const path of ['/', '/about', '/projects', '/blog', '/contact']) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    if (path === '/contact') await page.route('https://giscus.app/**', (route) => route.abort());
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  });
}
