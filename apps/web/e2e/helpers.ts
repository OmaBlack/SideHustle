import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'sidehustle-demo';
export const DEMO = {
  buyer: 'buyer@sidehustle.test',
  vendor: 'vendor@sidehustle.test',
  admin: 'admin@sidehustle.test',
};

/** Logs in through the API; the session cookie lands in the page's browser context. */
export async function loginAs(page: Page, email: string) {
  const res = await page.request.post('/v1/auth/login', { data: { email, password: DEMO_PASSWORD } });
  expect(res.status()).toBe(200);
}

/** WCAG 2.1 AA, as the definition of done asks (plan section 11). */
export async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

export async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
