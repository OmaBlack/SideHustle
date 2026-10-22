import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Ticket 0.7 done-when: components render in light and dark and are axe clean, at 320px and desktop.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of ['/', '/styleguide']) {
      test(`${path} has no axe violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
        ).toEqual([]);
      });
    }

    test('page does not scroll sideways', async ({ page }) => {
      await page.goto('/styleguide');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test('the stepper corrects a quantity below the MOQ and says so (AC-03)', async ({ page }) => {
  await page.goto('/styleguide');
  const qty = page.getByLabel('Quantity', { exact: true });
  await qty.fill('5');
  await qty.press('Enter');
  await expect(qty).toHaveValue('20');
  await expect(page.getByRole('status').filter({ hasText: 'minimum order is 20' })).toBeVisible();
});
