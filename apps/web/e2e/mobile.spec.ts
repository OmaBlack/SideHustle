import { expect, test } from '@playwright/test';

// Phone-only checks from the UI audit (items 2 and 7).
test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 768, 'phone layout only');

test('the product page keeps "Add to cart" in reach without scrolling', async ({ page }) => {
  await page.goto('/products/lux-tote');
  await expect(page.getByRole('button', { name: 'Add to cart' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(1);
});

test('the header leaves Cart and Log in to the bottom tab bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner').getByRole('link', { name: /Cart/ })).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Cart/ }),
  ).toBeVisible();
});
