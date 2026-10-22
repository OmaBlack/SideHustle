import { expect, test } from '@playwright/test';
import { DEMO, expectAxeClean, expectNoSideScroll, loginAs } from './helpers';

const PUBLIC = [
  '/',
  '/kits',
  '/kits/skin',
  '/products/lux-tote',
  '/vendors',
  '/vendors/luxe',
  '/goal',
  '/build',
  '/login',
  '/signup',
  '/privacy',
];
const SIGNED_IN: [keyof typeof DEMO, string[]][] = [
  ['buyer', ['/cart', '/checkout', '/orders', '/account', '/verify']],
  ['vendor', ['/vendor', '/vendor/products', '/vendor/deals', '/vendor/orders', '/vendor/requests']],
  [
    'admin',
    [
      '/admin',
      '/admin/vendors',
      '/admin/moderation',
      '/admin/orders',
      '/admin/kits',
      '/admin/hub',
      '/admin/settings',
      '/admin/audit',
    ],
  ],
];

// Definition of done: axe clean in light and dark at 320px and desktop, no sideways scroll.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });
    for (const path of PUBLIC) {
      test(`${path} is accessible`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        await expectAxeClean(page);
        await expectNoSideScroll(page);
      });
    }
    for (const [who, paths] of SIGNED_IN) {
      test(`${who} pages are accessible`, async ({ page }) => {
        test.setTimeout(120_000);
        await loginAs(page, DEMO[who]);
        for (const path of paths) {
          await page.goto(path);
          await expect(page.locator('h1')).toBeVisible();
          // Wait for client data so axe sees the real page, not the loading state.
          await expect(page.getByRole('status').filter({ hasText: /Loading/ })).toHaveCount(0, {
            timeout: 15_000,
          });
          await expectAxeClean(page);
          await expectNoSideScroll(page);
        }
      });
    }
  });
}
