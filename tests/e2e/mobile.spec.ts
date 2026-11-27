import { expect, test } from '@playwright/test';
import { loadDemo, openApp } from './helpers';

// Emulated Pixel 7 (Chromium). This is not evidence for real iPhone/Android devices (spec 15/21).
test.describe('mobile layout', () => {
  test('drawer navigation, visible copy buttons, no horizontal overflow', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('navigation', { name: 'Çalışma alanı' })).toBeHidden();
    await page
      .getByRole('navigation', { name: 'Ana gezinme' })
      .getByRole('button', { name: 'Sayfalar' })
      .click();
    await expect(page.getByRole('navigation', { name: 'Çalışma alanı' })).toBeVisible();
    await loadDemo(page);

    // Copy action is visible without hover and large enough to tap.
    const copy = page.getByRole('button', { name: 'Linki kopyala' }).first();
    await expect(copy).toBeVisible();
    const box = await copy.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Bottom navigation: quick note, search and inbox are one tap away, with 44 px targets.
    const nav = page.getByRole('navigation', { name: 'Ana gezinme' });
    for (const name of ['Sayfalar', 'Ara', 'Hızlı not', 'Gelen kutusu']) {
      const item = nav.getByRole('button', { name });
      await expect(item).toBeVisible();
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    // The page behind an open drawer does not scroll (scroll lock).
    await nav.getByRole('button', { name: 'Sayfalar' }).click();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    await page.getByRole('button', { name: 'Menüyü kapat' }).click();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  });
});
