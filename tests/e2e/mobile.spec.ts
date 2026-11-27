import { expect, test } from '@playwright/test';
import { loadDemo, openApp } from './helpers';

// Emulated Pixel 7 (Chromium). This is not evidence for real iPhone/Android devices (spec 15/21).
test.describe('mobile layout', () => {
  test('drawer navigation, visible copy buttons, no horizontal overflow', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('navigation', { name: 'Çalışma alanı' })).toBeHidden();
    await page.getByRole('button', { name: 'Menüyü aç' }).click();
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

    // Bottom dock quick note is reachable.
    await expect(
      page.locator('.mobile-dock').getByRole('button', { name: 'Hızlı not' }),
    ).toBeVisible();
  });
});
