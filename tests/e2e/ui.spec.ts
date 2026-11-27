import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadDemo, openApp } from './helpers';

/** The element really receives a click at its centre (not covered or clipped by a scroll box). */
async function expectHittable(page: Page, target: Locator) {
  await expect(target).toBeInViewport({ ratio: 1 });
  const box = await target.boundingBox();
  if (!box) throw new Error('no box');
  const hit = await page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x, y)?.closest('[role="menuitem"],[role="option"]')?.textContent ??
      '',
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).toContain((await target.textContent())?.trim() ?? '');
}

test.describe('interface regressions (visual identity v2)', () => {
  test('block picker near the bottom of the screen opens upwards, fully visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await openApp(page);
    await loadDemo(page);
    const add = page.getByRole('button', { name: 'Blok ekle' });
    await add.scrollIntoViewIfNeeded();
    await add.click();
    const picker = page.locator('.block-picker');
    await expect(picker).toBeInViewport({ ratio: 1 });
    await expectHittable(page, page.getByRole('option', { name: /Metin/ }).first());
  });

  test('a sidebar row menu is not clipped by the tree scroll box', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Üniversite işlemleri' }).click();
    await expectHittable(page, page.getByRole('menuitem', { name: 'Yeni defter' }));
  });

  test('home stays reachable after a page is open; the last page reopens at start', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Ana sayfa' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#home-title')).toBeVisible();
    await expect(page.getByText(/\d+ sayfa · \d+ defter · \d+ klasör/)).toBeVisible();
    // Opening a page and reloading the app root returns to that page (restore at start only).
    await page.getByRole('button', { name: /Proje desteği/ }).click();
    await expect(page.locator('#page-title')).toHaveValue('Proje desteği');
    await page.goto('/');
    await expect(page.locator('#page-title')).toHaveValue('Proje desteği');
  });

  test('block picker explains every type in one line', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    const descriptions = page.locator('.picker-desc');
    await expect(descriptions).toHaveCount(9);
    for (const text of await descriptions.allTextContents())
      expect(text.trim().length).toBeGreaterThan(5);
  });
});
