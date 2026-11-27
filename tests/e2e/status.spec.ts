import { expect, test } from '@playwright/test';
import { loadDemo, openApp } from './helpers';

test.describe('status tracking table', () => {
  test('tracker template → set statuses → counts filter → row history shows dated changes', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('tablo');
    await page.keyboard.press('Enter');
    await page
      .getByRole('dialog', { name: 'Tablo oluştur' })
      .getByRole('button', { name: 'Takip tablosu oluştur' })
      .click();

    const table = page.locator('.table-block');
    await expect(table.getByRole('columnheader', { name: /Durum/ })).toBeVisible();

    // Row 1: title, then status via the select editor (select cell → Enter opens the list).
    const title = table.locator('[data-cell="0:0"]');
    await title.click();
    await title.click();
    await page.keyboard.type('Prof. Örnek');
    await page.keyboard.press('Enter');

    const status = table.locator('[data-cell="0:1"]');
    await status.click();
    await page.keyboard.press('Enter');
    await table.getByRole('combobox', { name: 'Durum' }).selectOption({ label: 'Devam ediyor' });
    await expect(status).toHaveText('Devam ediyor');

    await status.click();
    await page.keyboard.press('Enter');
    await table.getByRole('combobox', { name: 'Durum' }).selectOption({ label: 'Yapıldı' });
    await expect(status.locator('.opt-badge')).toHaveText('Yapıldı');

    // Counts per status; clicking filters the view (data unchanged).
    const bar = table.getByRole('group', { name: /Durum durumları/ });
    await expect(bar.getByRole('button', { name: /Yapıldı\s*1/ })).toBeVisible();
    await bar.getByRole('button', { name: /Yapıldı\s*1/ }).click();
    await expect(table.getByText('3 satırdan 1 tanesi gösteriliyor')).toBeVisible();
    await table.getByRole('button', { name: 'Filtreyi kaldır' }).click();
    await expect(table.getByText('3 satır · ', { exact: false })).toBeVisible();

    // History in the row sheet, newest first.
    await table.getByRole('button', { name: '1. satırı düzenle' }).click();
    const dialog = page.getByRole('dialog', { name: 'Satırı düzenle' });
    const items = dialog.locator('.history-list li');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Durum: Devam ediyor → Yapıldı');
    await expect(items.nth(1)).toContainText('Durum: — → Devam ediyor');

    // Persisted: reload and check the badge and history again.
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('.table-block [data-cell="0:1"] .opt-badge')).toHaveText('Yapıldı');
  });

  test('CSV with a status column becomes coloured choices', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('tablo');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Tablo oluştur' });
    await dialog
      .getByRole('textbox')
      .first()
      .fill(
        'Üniversite;Hoca;Mail Durumu\nTU Delft;Dr. A;Atılmadı\nTU Delft;Dr. B;Gönderildi\nPoliMi;Prof. C;Olumsuz\nPoliMi;Prof. D;Atılmadı\n',
      );
    await expect(dialog.getByRole('combobox', { name: 'Mail Durumu sütununun türü' })).toHaveValue(
      'select',
    );
    await dialog.getByRole('button', { name: /Tabloyu oluştur/ }).click();
    const bar = page.locator('.table-block').getByRole('group', { name: /Mail Durumu durumları/ });
    await expect(bar.getByRole('button', { name: /Atılmadı\s*2/ })).toBeVisible();
    await expect(bar.getByRole('button', { name: /Olumsuz\s*1/ })).toBeVisible();
  });
});
