import { expect, test } from '@playwright/test';
import { DEMO_MAIL_BODY, loadDemo, openApp, waitSaved } from './helpers';

test.describe('G2 notebook flows', () => {
  test('T01: folder → notebook → page → link persists after reload with the exact URL', async ({
    page,
  }) => {
    await openApp(page);
    // Create folder via the empty-state action and rename inline.
    await page.getByRole('button', { name: 'Klasör oluştur' }).click();
    const rename = page.locator('.tree-rename');
    await rename.fill('Üniversite');
    await rename.press('Enter');
    await page.getByRole('button', { name: 'Üniversite işlemleri' }).click();
    await page.getByRole('menuitem', { name: 'Yeni defter' }).click();
    await page.locator('.tree-rename').fill('Linkler');
    await page.locator('.tree-rename').press('Enter');
    await page.getByRole('button', { name: 'Linkler işlemleri' }).click();
    await page.getByRole('menuitem', { name: 'Yeni sayfa' }).click();
    await page.locator('#page-title').fill('Satellite Systems');
    await page.locator('#page-title').press('Enter');

    // Add a link block.
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('link');
    await page.keyboard.press('Enter');
    const url = 'https://example.invalid/attendance?course=demo&t=Ab%2F9#form';
    await page.getByLabel('Adres', { exact: true }).fill(url);
    await page.getByLabel('Başlık', { exact: true }).fill('Yoklama');
    await page.getByRole('button', { name: 'Tamam' }).click();
    await waitSaved(page);

    await page.reload();
    const link = page.locator('a.link-title');
    await expect(link).toHaveAttribute('href', url);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.locator('.breadcrumb')).toHaveText(/Üniversite.*Linkler/);
  });

  test('rejects javascript: URLs and never stores them', async ({ page }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.getByRole('combobox', { name: 'Blok türü ara' }).fill('link');
    await page.keyboard.press('Enter');
    const field = page.getByLabel('Adres', { exact: true });
    await field.fill('javascript:alert(document.cookie)');
    await expect(page.getByText('Yalnız http ve https adresleri açılabilir.')).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await page.reload();
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('T02: mail draft copies body and subject separately, byte-exact', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Ara' }).first().click();
    await page.getByRole('combobox', { name: 'Sayfa ara ya da komut yaz…' }).fill('proje');
    await page.keyboard.press('Enter');
    await expect(page.locator('#page-title')).toHaveValue('Proje desteği');

    await page.getByRole('button', { name: 'Metni kopyala' }).click();
    await expect(page.getByRole('button', { name: 'Kopyalandı' })).toBeVisible();
    const body = await page.evaluate(() => navigator.clipboard.readText());
    expect(body.replace(/\r\n/g, '\n')).toBe(DEMO_MAIL_BODY);

    await page.getByRole('button', { name: 'Konuyu kopyala' }).click();
    // The clipboard write is asynchronous; read until it lands instead of racing it.
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('Proje desteği hakkında');
    const subject = await page.evaluate(() => navigator.clipboard.readText());
    expect(subject).not.toContain('Hocam');
  });

  test('copy denied → manual-copy dialog with the text selected, no false success', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    // Simulate a browser that refuses clipboard writes.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
          write: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
        },
      });
    });
    await page.getByRole('button', { name: 'Linki kopyala' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Kopyalanamadı' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('textarea')).toHaveValue(
      'https://example.invalid/attendance?course=demo#form',
    );
    await expect(page.getByRole('button', { name: 'Kopyalandı' })).toHaveCount(0);
  });

  test('T05: trash a page, undo from the toast, then trash and restore from the trash view', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Sayfa işlemleri' }).click();
    await page.getByRole('menuitem', { name: 'Çöp kutusuna at' }).click();
    await expect(page.getByText('“Satellite Systems” çöp kutusuna atıldı')).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /Satellite Systems/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Geri al' }).click();
    await expect(
      page.getByRole('button', { name: 'Satellite Systems', exact: true }),
    ).toBeVisible();

    // Trash the whole Üniversite folder, then restore it from the trash view.
    await page.getByRole('button', { name: 'Üniversite işlemleri' }).click();
    await page.getByRole('menuitem', { name: 'Çöp kutusuna at' }).click();
    await page.getByRole('button', { name: 'Çöp kutusu' }).click();
    const row = page.locator('.trash-row', { hasText: 'Üniversite' });
    await expect(row).toContainText('öğe');
    await row.getByRole('button', { name: 'Geri yükle' }).click();
    await expect(page.getByText('Çöp kutusu boş.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Üniversite', exact: true })).toBeVisible();
  });

  test('T03: text typed into a new block survives reload (local only, no network)', async ({
    page,
  }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost')) external.push(r.url());
    });
    await openApp(page);
    await loadDemo(page);
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.keyboard.press('Enter'); // default type: Metin
    await expect(page.locator('.rt-editor')).toBeFocused();
    await page.keyboard.type('Çevrimdışı not ğüşıöç İ');
    await expect(page.locator('.save-indicator')).not.toHaveText('Bu cihaza kaydedildi');
    await page.locator('#page-title').click(); // blur → flush
    await waitSaved(page);
    await page.reload();
    await expect(page.locator('.rt-view', { hasText: 'Çevrimdışı not ğüşıöç İ' })).toBeVisible();
    expect(external).toEqual([]);
  });

  test('quick capture: a pasted URL becomes a link block in the Inbox', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Hızlı not' }).first().click();
    await page
      .getByRole('textbox', { name: 'Aklındakini yaz ya da link yapıştır' })
      .fill('https://example.invalid/materials');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.getByRole('button', { name: 'Gelen kutusu' }).first().click();
    await expect(page.locator('#page-title')).toHaveValue('Hızlı notlar');
    await expect(page.locator('a.link-title')).toHaveAttribute(
      'href',
      'https://example.invalid/materials',
    );
  });

  test('moves a block with the keyboard-accessible menu and undoes with Ctrl+Z', async ({
    page,
  }) => {
    await openApp(page);
    await loadDemo(page);
    const titles = () => page.locator('a.link-title span').allTextContents();
    expect(await titles()).toEqual(['Yoklama', 'Ders materyalleri']);
    await page.getByRole('button', { name: 'Blok işlemleri: Link' }).nth(1).click();
    await page.getByRole('menuitem', { name: 'Yukarı taşı' }).click();
    await expect.poll(titles).toEqual(['Ders materyalleri', 'Yoklama']);
    await page.locator('body').click({ position: { x: 600, y: 500 } });
    await page.keyboard.press('Control+z');
    await expect.poll(titles).toEqual(['Yoklama', 'Ders materyalleri']);
  });
});
