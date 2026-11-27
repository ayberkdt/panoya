import { expect, test } from '@playwright/test';
import { loadDemo, openApp, waitSaved } from './helpers';

/**
 * Production build under the Vercel response headers (vercel.json → `vite preview`).
 * Run with `corepack pnpm e2e:prod`; the dev server sends no CSP, so the test is skipped there.
 */
test.describe('production headers', () => {
  test.skip(process.env.PW_TARGET !== 'prod', 'needs the production build (pnpm e2e:prod)');

  test('no CSP violations while editing; deep links survive a reload', async ({ page }) => {
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as unknown as { __csp: string[] }).__csp = log;
      document.addEventListener('securitypolicyviolation', (e) => {
        log.push(
          `${e.violatedDirective} ${e.blockedURI} ${e.sample} @ ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`,
        );
      });
    });

    const response = await page.goto('/');
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("script-src 'self'");
    await expect(page.locator('main#main')).toBeVisible();

    await loadDemo(page);
    // Rich text editor (lazy Tiptap chunk) — the part that would inject a <style> element.
    await page.getByRole('button', { name: 'Blok ekle' }).click();
    await page.keyboard.press('Enter');
    const editor = page.locator('.rt-editor');
    await expect(editor).toBeFocused();
    await page.keyboard.type('CSP altında yazı');
    // Base ProseMirror rules come from our stylesheet now (injectCSS: false).
    expect(await editor.evaluate((el) => getComputedStyle(el).whiteSpace)).toMatch(/break-spaces/);
    await page.locator('#page-title').click();
    await waitSaved(page);

    // SPA rewrite: the page URL loads directly from the server.
    const deepLink = new URL(page.url()).pathname;
    expect(deepLink).toMatch(/^\/w\/[^/]+\/p\/[^/]+$/);
    await openApp(page, deepLink);
    await expect(page.locator('#page-title')).toHaveValue('Satellite Systems');
    await expect(page.locator('.rt-view', { hasText: 'CSP altında yazı' })).toBeVisible();

    // The build serves hashed files from /assets/ (vercel.json caches that path immutably).
    const asset = await page.evaluate(
      () => document.querySelector<HTMLScriptElement>('script[type="module"]')?.src ?? '',
    );
    expect(asset).toMatch(/\/assets\//);

    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  });
});
