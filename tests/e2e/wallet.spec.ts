import { expect, test, type Page } from '@playwright/test';
import { loadDemo, openApp } from './helpers';

async function openPalette(page: Page) {
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Sayfa ara ya da komut yaz…' });
  await expect(input).toBeVisible();
  return input;
}

test.describe('wallet, statistics, search scopes, link button', () => {
  test('a new wallet from the block picker: add an expense and an income, balance follows', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('cüzdan');
    await page.keyboard.press('Enter');
    const panel = page.getByRole('region', { name: 'Cüzdan özeti' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Henüz girdi yok.', { exact: false })).toBeVisible();

    await panel.getByRole('button', { name: 'Gider ekle' }).click();
    const dialog = page.getByRole('dialog', { name: 'Gider ekle' });
    await dialog.getByLabel('Tutar (TRY)').fill('1.250,50');
    await dialog.getByLabel('Açıklama').fill('Market');
    await dialog.getByLabel('Açıklama').press('Enter');
    await expect(dialog).toBeHidden();

    await panel.getByRole('button', { name: 'Gelir ekle' }).click();
    const income = page.getByRole('dialog', { name: 'Gelir ekle' });
    await income.getByLabel('Tutar (TRY)').fill('3000');
    await income.getByRole('button', { name: 'Ekle' }).click();
    await expect(income).toBeHidden();

    // 3000 − 1250,50 = 1749,50 (exact decimal arithmetic)
    await expect(panel.locator('.kpi-balance .kpi-value')).toHaveText(/1\.749,50/);
    await expect(panel.getByText('2 girdi')).toBeVisible();
    await expect(panel.locator('.bar-row').first()).toContainText('Market');
  });

  test('an invalid amount is not saved and the form says why', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('cüzdan');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Gider ekle' }).click();
    const dialog = page.getByRole('dialog', { name: 'Gider ekle' });
    await dialog.getByLabel('Tutar (TRY)').fill('on lira');
    await dialog.getByRole('button', { name: 'Ekle' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Tutarı sayı olarak yaz');
    await expect(dialog).toBeVisible();
  });

  test('the sample wallet shows statistics; the table shows dates and amounts readably', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    const input = await openPalette(page);
    await input.fill('cüzdan');
    await page
      .getByRole('option', { name: /Cüzdan/ })
      .first()
      .click();
    const panel = page.getByRole('region', { name: 'Cüzdan özeti' });
    await expect(panel.getByText('15 girdi')).toBeVisible();
    await expect(panel.locator('.bar-row').first()).toContainText('Kira');
    await expect(panel.locator('.month')).toHaveCount(6);
    // no stored formats on screen: 42000 → 42.000,00 and no YYYY-MM-DD dates
    const grid = page.locator('.grid');
    await expect(grid).toContainText('42.000,00');
    await expect(grid).not.toContainText(/\d{4}-\d{2}-\d{2}/);
  });

  test('search scopes filter by kind without any query syntax', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    await openPalette(page);
    await expect(page.getByText(/tag:|type:/)).toHaveCount(0);
    await page.getByRole('radio', { name: 'Linkler' }).click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.first()).toContainText(/Yoklama|Ders materyalleri/);
    // closing resets the scope
    await page.keyboard.press('Escape');
    await openPalette(page);
    await expect(page.getByRole('radio', { name: 'Tümü' })).toHaveAttribute('aria-checked', 'true');
  });

  test('a link card has a large open button pointing at the saved address', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    const open = page
      .getByRole('link', { name: /example\.invalid adresini yeni sekmede aç/ })
      .filter({
        hasText: 'Aç',
      });
    await expect(open.first()).toBeVisible();
    await expect(open.first()).toHaveAttribute('href', /^https:\/\/example\.invalid\//);
    const box = await open.first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('number columns get totals; a visible button adds a column', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('tablo');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Tablo oluştur' });
    await dialog.getByRole('textbox').first().fill('ad;tutar\nkira;1250\nmarket;87,5\n');
    await dialog.getByRole('button', { name: /Tabloyu oluştur/ }).click();
    const stats = page.getByRole('definition').first();
    await expect(page.locator('.stat-strip')).toContainText('Toplam');
    await expect(stats).toContainText('1.337,5');
    await page.locator('.table-block').getByRole('button', { name: 'Sütun ekle' }).first().click();
    await expect(page.getByRole('dialog', { name: /Sütun/ })).toBeVisible();
  });
  test('a large paste lands in one transaction (real IndexedDB, 1,000 rows)', async ({ page }) => {
    test.setTimeout(90_000);
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('cüzdan');
    await page.keyboard.press('Enter');
    const panel = page.getByRole('region', { name: 'Cüzdan özeti' });
    await expect(panel).toBeVisible();
    const tsv = Array.from({ length: 1000 }, (_, i) =>
      [
        `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
        `Girdi ${i}`,
        'Market',
        'Gider',
        '10',
      ].join('\t'),
    ).join('\n');
    await page.evaluate((text) => {
      const table = [...document.querySelectorAll('.table-block')].pop()!.querySelector('table')!;
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      table.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }, tsv);
    await expect(panel.getByText('1000 girdi')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.toast-error')).toHaveCount(0);
  });
});
