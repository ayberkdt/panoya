import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadDemo, openApp } from './helpers';

const FIXTURE = 'x;y;label\n1;2;bir\n2;4;iki\n3;6;üç\n4;;eksik y\n5;10;beş\n;12;eksik x\n';

async function openPalette(page: Page) {
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Sayfa ara ya da komut yaz…' });
  await expect(input).toBeVisible();
  await expect(page.getByText('Arama dizini hazırlanıyor…')).toHaveCount(0);
  return input;
}

async function createTableFromCsv(page: Page, csv: string) {
  await page.getByRole('button', { name: 'Blok ekle' }).click();
  await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('tablo');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Tablo oluştur' });
  await dialog.getByRole('textbox').first().fill(csv);
  await dialog.getByRole('button', { name: /Tabloyu oluştur/ }).click();
  await expect(dialog).toBeHidden();
}

test.describe('G3 search', () => {
  test('finds block content with Turkish folding and follows renames', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    let input = await openPalette(page);
    await input.fill('OZGUL ITKI'); // "Özgül itki" in Rocket Propulsion notes
    const hit = page.getByRole('option').filter({ hasText: 'Rocket Propulsion' }).first();
    await expect(hit).toBeVisible();
    await expect(hit.locator('mark').first()).toHaveText(/Özgül/i);
    await page.keyboard.press('Enter');
    await expect(page.locator('#page-title')).toHaveValue('Rocket Propulsion');

    // Rename the page; the index updates without reload.
    await page.locator('#page-title').fill('İtki Notları');
    await page.locator('#page-title').press('Enter');
    input = await openPalette(page);
    await input.fill('itki notlari');
    await expect(page.getByRole('option', { name: /İtki Notları/ }).first()).toBeVisible();
    await input.fill('rocket propulsion');
    await expect(page.getByRole('option').filter({ hasText: 'Rocket Propulsion' })).toHaveCount(0);
  });

  test('filters and reports query errors; trashed pages disappear from results', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    const input = await openPalette(page);
    await input.fill('type:link yoklama');
    await expect(page.getByRole('option').filter({ hasText: 'Yoklama' }).first()).toBeVisible();
    await input.fill('before:yarın');
    await expect(page.getByText('tarihi YYYY-AA-GG biçiminde olmalı')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Sayfa işlemleri' }).click();
    await page.getByRole('menuitem', { name: 'Çöp kutusuna at' }).click();
    const again = await openPalette(page);
    await again.fill('yoklama');
    await expect(page.getByRole('option').filter({ hasText: 'Yoklama' })).toHaveCount(0);
  });
});

test.describe('G3 tables', () => {
  test('CSV preview → typed table, missing ≠ 0, invalid input rejected, persists after reload', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    await createTableFromCsv(page, FIXTURE);
    const table = page.locator('.table-block');
    await expect(table.getByText('6 satır · 2 boş hücre')).toBeVisible();
    // Row 4 "y" is missing (dash), row 6 "x" is missing; 0 would have been shown as 0.
    await expect(table.locator('[data-cell="3:1"]')).toHaveText('—');

    // Edit a cell with a Turkish decimal, then try an invalid number.
    await table.locator('[data-cell="3:1"]').click();
    await table.locator('[data-cell="3:1"]').click();
    await page.keyboard.type('8,5');
    await page.keyboard.press('Enter');
    await expect(table.locator('[data-cell="3:1"]')).toHaveText('8,5');
    await expect(table.getByText('6 satır · 1 boş hücre')).toBeVisible();

    await page.keyboard.type('abc'); // focus moved to row 5, column y
    await page.keyboard.press('Enter');
    await expect(table.getByRole('alert')).toContainText('Sayı değil');
    await page.keyboard.press('Escape');
    await expect(table.locator('[data-cell="4:1"]')).toHaveText('10');

    await page.reload();
    await expect(page.locator('.table-block [data-cell="3:1"]')).toHaveText('8,5');
  });

  test('paste is all-or-nothing and can extend the table', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page);
    await loadDemo(page);
    await createTableFromCsv(page, 'ad;değer\na;1\n');
    const table = page.locator('.table-block');
    const cell = table.locator('[data-cell="0:1"]');
    await cell.click();

    const paste = async (text: string) => {
      await page.evaluate((t) => navigator.clipboard.writeText(t), text);
      await page.keyboard.press('Control+v');
    };
    await paste('5\nbeş');
    await expect(page.getByText('Yapıştırılmadı: 1 değer')).toBeVisible();
    await expect(cell).toHaveText('1');

    await paste('5\n6\n7');
    await expect(table.getByText('3 satır', { exact: false })).toBeVisible();
    await expect(table.locator('[data-cell="2:1"]')).toHaveText('7');
  });

  test('CSV export is spreadsheet-safe', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    await createTableFromCsv(page, 'not;tutar\n=HYPERLINK("x");-5\n');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tablo işlemleri' }).click();
    await page.getByRole('menuitem', { name: 'CSV olarak indir', exact: true }).click();
    // Check the toast while it is up; waiting for the file first raced its lifetime.
    await expect(page.getByText('= ile başlayan 1 hücre')).toBeVisible();
    const file = await (await download).path();
    const text = readFileSync(file, 'utf8');
    expect(text).toContain(`"'=HYPERLINK(""x"")";-5`);
  });
});

test.describe('G3 backup', () => {
  test('download backup → restore as a new workspace → content and table intact', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    await createTableFromCsv(page, FIXTURE);

    await page.getByRole('button', { name: 'Çalışma alanı ve yedek' }).click();
    await page.getByRole('menuitem', { name: 'Yedeği indir (.zip)' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('dialog', { name: 'Yedeği indir (.zip)' })
      .getByRole('button', { name: 'İndir' })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^panoya-yedek-\d{4}-\d{2}-\d{2}\.zip$/);
    const zipPath = await download.path();

    await page.getByRole('button', { name: 'Çalışma alanı ve yedek' }).click();
    await page.getByRole('menuitem', { name: 'Yedekten geri yükle…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yedekten geri yükle…' });
    await dialog.locator('input[type="file"]').setInputFiles(zipPath);
    await expect(dialog.getByText('Yedek eksiksiz ve bozulmamış.')).toBeVisible();
    await expect(dialog.getByText(/2 tablo/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Yeni çalışma alanı olarak geri yükle' }).click();

    // The app reloads into the restored workspace.
    await expect(page.getByRole('button', { name: 'Çalışma alanı ve yedek' })).toContainText(
      '(geri yüklendi)',
    );
    await page.getByRole('button', { name: 'Üniversite', exact: true }).click();
    await page.getByRole('button', { name: 'Linkler', exact: true }).click();
    await page.getByRole('button', { name: 'Satellite Systems', exact: true }).click();
    await expect(page.locator('a.link-title').first()).toHaveAttribute(
      'href',
      'https://example.invalid/attendance?course=demo#form',
    );
    await expect(page.locator('.table-block').getByText('6 satır · 2 boş hücre')).toBeVisible();
  });

  test('rejects a file that is not a Panoya backup', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Çalışma alanı ve yedek' }).click();
    await page.getByRole('menuitem', { name: 'Yedekten geri yükle…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yedekten geri yükle…' });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'x.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('not a zip'),
    });
    await expect(dialog.getByRole('alert')).toHaveText(
      'Bu bir yedek dosyası değil ya da dosya bozuk.',
    );
    await expect(
      dialog.getByRole('button', { name: 'Yeni çalışma alanı olarak geri yükle' }),
    ).toBeDisabled();
  });
});
