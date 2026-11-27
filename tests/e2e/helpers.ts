import { expect, type Page } from '@playwright/test';

/** Opens the app and waits until the workspace is ready (sidebar rendered). */
export async function openApp(page: Page, path = '/') {
  await page.goto(path);
  // The sidebar is a hidden drawer on phones, so wait for the main region instead.
  await expect(page.locator('main#main')).toBeVisible();
}

export async function loadDemo(page: Page) {
  await page.getByRole('button', { name: 'Örnek içerik ekle' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Örnek içerik ekle' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#page-title')).toHaveValue('Satellite Systems');
}

/** Waits until every pending autosave has committed. */
export async function waitSaved(page: Page) {
  await expect(page.locator('.save-indicator')).toHaveText('Bu cihaza kaydedildi', {
    timeout: 5000,
  });
}

export const DEMO_MAIL_BODY =
  'Hocam merhaba,\n\nHazırladığım örnek belgeleri ekte paylaşıyorum.\n\nDesteğiniz için teşekkür ederim.\n\nSaygılarımla,';
