import { expect, test } from '@playwright/test';

test('visitor can navigate the blog system and return to the terminal', async ({ page }) => {
  await page.goto('/blog');
  await expect(page.getByRole('heading', { name: 'Writing', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Writing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Writing', exact: true })).toBeVisible();
  await page.locator('a[href="/"]').first().click();
  await expect(page.locator('iframe[title="MyDev terminal blog"]')).toBeVisible();
});

test('visitor can join the public GitHub guestbook', async ({ page }) => {
  await page.route('https://giscus.app/**', (route) => route.abort());
  const response = await page.goto('/contact');
  await expect(page.getByRole('heading', { name: 'Leave a signal.' })).toBeVisible();
  await expect(page.getByText('使用 GitHub 账号登录后即可公开留言')).toBeVisible();
  await expect(page.locator('.guestbook-shell form')).toHaveCount(0);

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
  expect(policy).toMatch(/frame-src[^;]*https:\/\/giscus\.app/);
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

test('blog list and published article render through the public query path', async ({ page }) => {
  const listResponse = await page.goto('/blog');
  expect(listResponse?.status()).toBe(200);
  expect(listResponse?.headers()['cache-control']).toContain('s-maxage=300');
  await expect(page.getByRole('heading', { name: 'Writing' })).toBeVisible();

  const articleLink = page.getByRole('link', { name: 'Primary/Backup Replication', exact: true });
  await expect(articleLink).toBeVisible();
  const detailResponse = await page.goto(await articleLink.getAttribute('href') ?? '');
  expect(detailResponse?.status()).toBe(200);
  expect(detailResponse?.headers()['cache-control']).toContain('s-maxage=300');
  await expect(page.getByRole('heading', { name: 'Primary/Backup Replication' })).toBeVisible();
  await expect(page.locator('#article-content')).toBeVisible();
});

test('homepage terminal stays inside its measured container', async ({ page }) => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 768, height: 720 }, { width: 1400, height: 880 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const terminal = page.locator('iframe').first().contentFrame();
    await terminal.locator('.xterm-screen').waitFor({ state: 'attached' });
    const bounds = await terminal.locator('#term').evaluate((container) => {
      const frame = container.getBoundingClientRect();
      const surfaces = [...container.querySelectorAll('.xterm-screen, .xterm-viewport')].map((element) =>
        element.getBoundingClientRect(),
      );
      return {
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        documentOverflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        rightOverflow: Math.max(0, ...surfaces.map((surface) => surface.right - frame.right)),
        bottomOverflow: Math.max(0, ...surfaces.map((surface) => surface.bottom - frame.bottom)),
      };
    });
    expect(bounds).toEqual({ documentOverflowX: 0, documentOverflowY: 0, rightOverflow: 0, bottomOverflow: 0 });
  }
});

test('blog rejects invalid page numbers by displaying the first page', async ({ page }) => {
  await page.goto('/blog');
  const articleLinks = page.locator('.post-row h3 a');
  const firstPage = await articleLinks.allTextContents();
  for (const value of ['1.25', 'Infinity', '-Infinity', 'NaN', '0', '-1', '9007199254740991', '1e100']) {
    const response = await page.goto(`/blog?page=${encodeURIComponent(value)}`);
    expect(response?.status(), `page=${value}`).toBe(200);
    await expect(page.getByRole('heading', { name: 'Writing', exact: true })).toBeVisible();
    expect(await articleLinks.allTextContents()).toEqual(firstPage);
    await expect(page.getByRole('heading', { name: 'Signal lost.' })).toHaveCount(0);
  }
});

test('reduced motion disables background animation in the blog', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/blog');
  await expect(page.getByRole('heading', { name: 'Writing', exact: true })).toBeVisible();
  const aurora = page.locator('.aurora-primary');
  await expect(aurora).toHaveCount(1);
  expect(await aurora.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await expect(page.locator('.optical-cursor')).toHaveCount(0);
});
