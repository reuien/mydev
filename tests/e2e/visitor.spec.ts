import { expect, test } from '@playwright/test';

test('visitor can understand and navigate the portfolio', async ({ page }, testInfo) => {
  await page.goto('/');
  const backdrop = page.locator('[data-cosmic-backdrop]');
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  await expect(backdrop.locator('canvas')).toHaveCount(1);
  // A rendered diagram is not enough: production CSP must allow its script to run.
  await expect(backdrop).toHaveAttribute('data-ready', 'true');
  expect(await backdrop.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  const aurora = backdrop.locator('.aurora-primary');
  const initialTransform = await aurora.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(400);
  await expect
    .poll(() => aurora.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(initialTransform);
  await expect(page.getByRole('heading', { name: /Build systems/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'System commands' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'System status' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Activity stream' })).toBeVisible();
  const topology = page.locator('[data-system-topology]');
  await expect(topology).toHaveCount(1);
  const topologyNode = topology.locator('[data-topology-node]').first();
  const topologyCore = topology.locator('.topology-core');
  await expect(topologyNode).toHaveCount(1);
  if (testInfo.project.name === 'chromium') {
    await page.mouse.move(80, 120);
    const initialPointerState = await page.evaluate(() => ({
      backdrop: getComputedStyle(document.querySelector<HTMLElement>('[data-cosmic-backdrop]')!).getPropertyValue('--pointer-x'),
      node: document.querySelector('[data-topology-node]')?.getAttribute('transform'),
      core: document.querySelector('.topology-core')?.getAttribute('transform'),
    }));
    await page.mouse.move(1100, 620);
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.querySelector<HTMLElement>('[data-cosmic-backdrop]')!).getPropertyValue('--pointer-x'),
        ),
      )
      .not.toBe(initialPointerState.backdrop);
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('[data-topology-node]')?.getAttribute('transform')),
      )
      .not.toBe(initialPointerState.node);
    expect(await topologyCore.getAttribute('transform')).toBe(initialPointerState.core);
  }
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Writing', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Message/ })).toHaveAttribute('href', '/contact');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);

  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'page');
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

test('homepage copy and topology fit narrow, tablet, and desktop screens', async ({ page }) => {
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    const heading = page.getByRole('heading', { name: /Build systems/i });
    await expect(heading).toBeVisible();
    const copy = await page.locator('.workspace-copy').boundingBox();
    const diagram = await page.locator('.topology-stage').boundingBox();
    expect(copy).not.toBeNull();
    expect(diagram).not.toBeNull();
    expect(diagram!.x).toBeGreaterThanOrEqual(0);
    expect(diagram!.x + diagram!.width).toBeLessThanOrEqual(width);
    if (width > 720) {
      expect(copy!.x + copy!.width).toBeLessThanOrEqual(diagram!.x);
    } else {
      expect(copy!.y + copy!.height).toBeLessThanOrEqual(diagram!.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('navigation', { name: 'System commands' }).getByRole('link')).toHaveCount(4);
  }
});

test('reduced motion keeps the homepage readable without animated cues', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('节点相连，想法生长', { exact: true })).toBeVisible();
  await expect(page.getByText('移动鼠标，探索节点之间的联系', { exact: true })).toBeHidden();
  for (const selector of ['.aurora-primary', '.core-pulse', '.signal-scan']) {
    expect(await page.locator(selector).evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  }
});
