import { expect, test } from '@playwright/test';
import { DEMO, DEMO_PASSWORD, loginAs } from './helpers';

// These share one database, so they run in order on one browser size.
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'flows run once, at desktop size');

test('search shows an empty state with a clear action (AC-12, FR-SRCH-02)', async ({ page }) => {
  await page.goto('/');
  const search = page.getByLabel('Search products, vendors or places');
  await search.fill('zzzz-nothing');
  await expect(page.getByText('No products match “zzzz-nothing”')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await search.fill('kano');
  await expect(page.getByRole('link', { name: /Shea Butter/ })).toBeVisible();
});

test('checkout asks a visitor to log in, then returns there (AC-09, FR-ACC-06)', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/);
  await page.getByLabel('Email').fill(DEMO.buyer);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
});

test('the product page corrects a quantity below the MOQ (AC-03) and prices options (FR-PROD-04)', async ({
  page,
}) => {
  await page.goto('/products/lux-tote');
  const qty = page.getByLabel('Quantity', { exact: true });
  await qty.fill('1');
  await qty.press('Enter');
  await expect(qty).toHaveValue('3');
  await expect(page.getByText('The minimum order is 3, so we changed your quantity to 3.')).toBeVisible();
});

test('a buyer buys a starter kit and the vendor ships it (UC-1, UC-6, AC-11)', async ({ page, browser }) => {
  // Buyer: logged out add → login → cart → checkout → dev payment → Paid.
  await page.goto('/kits/leather');
  await page.getByRole('button', { name: 'Add kit to cart' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill(DEMO.buyer);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('link', { name: 'Leather Gifting Kit' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to checkout' }).click();
  // FR-CHK-04: the estimate is visible before the quote.
  await expect(page.getByText('Estimated total')).toBeVisible();
  await expect(page.getByText('₦98,000').first()).toBeVisible();
  await page.getByRole('button', { name: 'Review total' }).click();
  await expect(page.getByText('Order summary')).toBeVisible();
  await page.getByRole('button', { name: /^Pay ₦98,000$/ }).click();
  await expect(page).toHaveURL(/\/pay\/dev\/SH-/);
  const ref = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Pay (test)' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${ref}\\?paid=1`));
  await expect(page.getByText(`Payment received. Order ${ref}`)).toBeVisible();

  // Vendor (Luxe Leather Label supplies the whole kit) confirms and dispatches.
  const vctx = await browser.newContext();
  const v = await vctx.newPage();
  await loginAs(v, DEMO.vendor);
  await v.goto('/vendor/orders');
  const card = v.locator('li', { hasText: ref });
  await card.getByRole('button', { name: 'Confirm order' }).click();
  await v.getByRole('button', { name: 'Confirmed', exact: true }).click();
  await card.getByLabel('Tracking reference').fill('GIG-12345');
  await card.getByRole('button', { name: 'Mark dispatched' }).click();
  await v.getByRole('button', { name: 'Dispatched', exact: true }).click();
  await expect(v.locator('li', { hasText: ref })).toContainText('Tracking: GIG-12345');
  await vctx.close();

  // Buyer sees the step and tracking reference (FR-ORD-03).
  await page.goto(`/orders/${ref}`);
  await expect(page.getByText('Tracking: GIG-12345')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Dispatched (done)' })).toBeVisible();
});

test('a vendor cannot post a headline over 60 characters (AC-10)', async ({ page }) => {
  await loginAs(page, DEMO.vendor);
  await page.goto('/vendor/deals');
  await page.getByLabel('Headline').fill('x'.repeat(61));
  await expect(page.getByText('Headlines can be at most 60 characters')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post deal' })).toBeDisabled();
  await page.getByLabel('Headline').fill('Leather week: 15% off everything');
  await expect(page.getByText('Leather week: 15% off everything')).toBeVisible();
});

test('the kit builder shows live totals and the discount hint (FR-BLD-03/04)', async ({ page }) => {
  await page.goto('/build');
  await page.getByRole('button', { name: 'Add Unrefined Shea Butter, 500g tub to your kit' }).click();
  await expect(page.getByText('Spend ₦56,000 more to get 5% off')).toBeVisible();
  await page.getByLabel('Quantity of Unrefined Shea Butter, 500g tub').fill('50');
  await page.getByLabel('Quantity of Unrefined Shea Butter, 500g tub').press('Enter');
  await expect(
    page.getByRole('region', { name: 'Your kit', exact: true }).getByText('−₦5,500'),
  ).toBeVisible();
});

test('an admin approves a vendor application (FR-ADM-01)', async ({ page, browser }) => {
  const actx = await browser.newContext();
  const applicant = await actx.newPage();
  const email = `vendor-${Date.now()}@example.com`;
  const signup = await applicant.request.post('/v1/auth/signup', {
    data: {
      name: 'Kemi Applicant',
      phone: `0809${String(Date.now()).slice(-7)}`,
      email,
      state: 'Oyo',
      password: 'a good long password',
      acceptTerms: true,
      ageConfirmed: true,
    },
  });
  expect(signup.status()).toBe(201);
  await applicant.goto('/vendor');
  await applicant.getByLabel('Business name').fill('Ibadan Beads');
  await applicant.getByLabel('Main category').selectOption({ label: 'Fashion & Leather' });
  await applicant.getByLabel('Location', { exact: true }).fill('Ibadan, Oyo');
  await applicant.getByRole('button', { name: 'Send application' }).click();
  await expect(applicant.getByText('Waiting for verification')).toBeVisible();

  await loginAs(page, DEMO.admin);
  await page.goto('/admin/vendors');
  const row = page.locator('li', { hasText: 'Ibadan Beads' });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(row).toHaveCount(0);
  await applicant.reload();
  await expect(applicant.getByText('Verified vendor')).toBeVisible();
  await actx.close();
  await page.goto('/admin/audit');
  await expect(page.getByText('vendor.approve').first()).toBeVisible();
});

test('a visitor signs up with consent and the 18+ confirmation, then can download and delete their data (NDPA)', async ({
  page,
}) => {
  const stamp = String(Date.now()).slice(-7);
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Ngozi Seller');
  await page.getByLabel('Phone number').fill(`0807${stamp}`);
  await page.getByLabel('Email').fill(`ngozi-${stamp}@example.com`);
  await page.getByLabel('State').selectOption('Enugu');
  await page.getByLabel('Password').fill('a long enough password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('You must be 18 or older to open an account')).toBeVisible();
  await page.getByLabel(/I agree to the terms/).check();
  await page.getByLabel('I am 18 or older').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify/);

  await page.goto('/account');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download my data' }).click();
  expect((await download).suggestedFilename()).toMatch(/^sidehustle-my-data-.*\.json$/);

  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByLabel('Your password').last().fill('a long enough password');
  await page.getByRole('button', { name: 'Delete my account forever' }).click();
  await expect(page).toHaveURL(/\/account\/deleted$/);
  await expect(page.getByRole('heading', { name: 'Your account has been deleted' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible();
});
