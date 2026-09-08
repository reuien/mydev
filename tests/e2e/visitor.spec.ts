import { expect, test } from '@playwright/test';

test('visitor can understand and navigate the portfolio', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Build/ })).toBeVisible();
  await expect(page.getByText('我专注于设计和构建目标明确的 Web 产品')).toBeVisible();
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

test('visitor can leave a message draft without opening an email client', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByRole('heading', { name: 'Leave a signal.' })).toBeVisible();
  await expect(page.getByText('告诉我你正在构思的想法')).toBeVisible();
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('How can I reach you?').fill('ada@example.com');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('I would like to discuss a new product.');
  await page.getByRole('button', { name: 'Save message draft' }).click();
  await expect(page.getByRole('status')).toContainText('草稿已保存在此设备上');
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
