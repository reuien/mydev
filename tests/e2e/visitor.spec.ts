import { expect, test } from '@playwright/test';

test('visitor can understand and navigate the portfolio', async ({ page }) => {
  await page.goto('/');
  const backdrop = page.locator('[data-cosmic-backdrop]');
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  await expect(backdrop.locator('canvas')).toHaveCount(1);
  expect(await backdrop.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  await expect(page.getByRole('heading', { name: /Build/ })).toBeVisible();
  await expect(page.locator('.hero-copy p')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Writing', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Message/ })).toHaveAttribute('href', '/contact');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);

  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await page.goto('/blog');
  await expect(page.getByRole('heading', { name: 'Writing' })).toBeVisible();
});

test('visitor can join the public GitHub guestbook', async ({ page }) => {
  await page.route('https://giscus.app/**', (route) => route.abort());
  const response = await page.goto('/contact');
  await expect(page.getByRole('heading', { name: 'Leave a signal.' })).toBeVisible();
  await expect(page.getByText('使用 GitHub 账号登录后即可公开留言')).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);

  const embed = page.locator('script[src="https://giscus.app/client.js"]');
  await expect(embed).toHaveAttribute('data-repo', 'reuien/mydev-discussions');
  await expect(embed).toHaveAttribute('data-repo-id', 'R_kgDOUR664w');
  await expect(embed).toHaveAttribute('data-mapping', 'number');
  await expect(embed).toHaveAttribute('data-term', '1');
  await expect(embed).toHaveAttribute('data-input-position', 'top');
  await expect(embed).toHaveAttribute('data-theme', 'dark');
  await expect(embed).toHaveAttribute('data-lang', 'zh-CN');

  const policy = response?.headers()['content-security-policy'] ?? '';
  expect(policy).toContain("script-src 'self' https://giscus.app");
  expect(policy).toContain('frame-src https://giscus.app');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
});

test('unknown pages render a navigable custom 404', async ({ page }) => {
  const response = await page.goto('/not-a-real-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Wrong turn.' })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回首页' })).toBeVisible();
});

test('mobile layout has no horizontal overflow', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
