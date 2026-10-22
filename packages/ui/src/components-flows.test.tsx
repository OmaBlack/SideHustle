import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BottomTabBar,
  BundleSummary,
  EmptyState,
  KitCard,
  LinkProvider,
  Monogram,
  OrderProgress,
  ProductCard,
  ProfitCalculator,
  Slideshow,
  ToastOnMount,
  ToastProvider,
  VendorCard,
  initials,
} from './index.js';

afterEach(cleanup);

describe('ProductCard', () => {
  it('shows promo price, MOQ, margin and the customisable badge (FR-PROD-01/02)', () => {
    render(
      <ProductCard
        href="/products/shea"
        name="Shea Butter"
        vendorName="Arewa Naturals"
        location="Kano"
        unitKobo={176_000}
        originalKobo={220_000}
        discountPct={20}
        moqText="Min. 20"
        marginText="56% margin"
        customisableText="Customisable"
        wasLabel="was"
      />,
    );
    expect(screen.getByRole('link', { name: 'Shea Butter' }).getAttribute('href')).toBe('/products/shea');
    expect(screen.getByText('₦1,760')).toBeTruthy();
    expect(screen.getByText('−20%')).toBeTruthy();
    expect(screen.getByText('Min. 20')).toBeTruthy();
    expect(screen.getByText('Customisable')).toBeTruthy();
  });

  it('uses the app link component when one is provided', () => {
    const Spy = vi.fn((p: { href: string; children?: React.ReactNode }) => (
      <a data-spy href={p.href}>
        {p.children}
      </a>
    ));
    render(
      <LinkProvider value={Spy}>
        <ProductCard
          href="/p"
          name="X"
          vendorName="V"
          location="L"
          unitKobo={100}
          moqText=""
          marginText=""
          wasLabel="was"
        />
      </LinkProvider>,
    );
    expect(document.querySelector('[data-spy]')).toBeTruthy();
  });
});

describe('KitCard and VendorCard', () => {
  it('shows kit price, resale value, profit and availability (FR-KIT-02/05)', () => {
    render(
      <KitCard
        href="/kits/skin"
        name="Skincare Reseller Kit"
        priceKobo={12_500_000}
        retailKobo={24_800_000}
        profitKobo={12_300_000}
        marginText="50% margin"
        contentsText="82 units · 3 products"
        labels={{ price: 'Kit price', resale: 'Resale value', profit: 'Profit' }}
        unavailableText="Out of stock"
      />,
    );
    expect(screen.getByText('₦125,000')).toBeTruthy();
    expect(screen.getByText('₦248,000')).toBeTruthy();
    expect(screen.getByText('₦123,000')).toBeTruthy();
    expect(screen.getByText('Out of stock')).toBeTruthy();
  });

  it('shows the verified badge only when given (FR-VEN-06)', () => {
    const { rerender } = render(
      <VendorCard
        href="/v"
        name="Luxe Leather"
        location="Lekki"
        statsText="5 products"
        verifiedText="Verified vendor"
      />,
    );
    expect(screen.getByText(/Verified vendor/)).toBeTruthy();
    rerender(<VendorCard href="/v" name="Luxe Leather" location="Lekki" statsText="5 products" />);
    expect(screen.queryByText(/Verified vendor/)).toBeNull();
  });

  it('builds monogram initials from the first two words', () => {
    expect(initials('Luxe Leather Label')).toBe('LL');
    expect(initials('  arewa ')).toBe('A');
    const { container } = render(<Monogram name="Luxe Leather" />);
    expect(container.textContent).toBe('LL');
  });
});

describe('ProfitCalculator', () => {
  it('defaults to the RRP and recomputes when the resale price changes (FR-PROD-07)', () => {
    render(
      <ProfitCalculator
        unitCostKobo={220_000}
        qty={20}
        rrpKobo={400_000}
        labels={{
          title: 'Profit',
          resale: 'Resale price per unit',
          cost: 'Cost',
          revenue: 'Revenue',
          profit: 'Profit if all sell',
          estimate: 'Estimate',
        }}
      />,
    );
    const input = screen.getByLabelText('Resale price per unit') as HTMLInputElement;
    expect(input.value).toBe('4000');
    expect(screen.getByText('₦44,000')).toBeTruthy();
    expect(screen.getByText('₦80,000')).toBeTruthy();
    expect(screen.getByText('₦36,000')).toBeTruthy();
    fireEvent.change(input, { target: { value: '2000' } });
    expect(screen.getByText('−₦4,000')).toBeTruthy();
  });
});

describe('BundleSummary', () => {
  it('shows the discount as its own line and the margin (FR-BLD-03)', () => {
    render(
      <BundleSummary
        costKobo={10_000_000}
        discountKobo={500_000}
        payKobo={9_500_000}
        retailKobo={18_000_000}
        profitKobo={8_500_000}
        marginPct={47}
        labels={{
          title: 'Your kit',
          cost: 'Cost',
          discount: 'Bundle discount',
          pay: 'To pay',
          resale: 'Resale',
          profit: 'Profit',
          margin: '{pct}% margin',
          estimate: 'Estimates',
        }}
      />,
    );
    expect(screen.getByText('−₦5,000')).toBeTruthy();
    expect(screen.getByText('₦95,000')).toBeTruthy();
    expect(screen.getByText('47% margin')).toBeTruthy();
  });
});

describe('OrderProgress', () => {
  const steps = ['Paid', 'Confirmed by vendor', 'Dispatched', 'Delivered'] as const;
  it('marks completed steps and the current one (FR-ORD-03)', () => {
    render(<OrderProgress steps={steps} done={2} label="Progress" />);
    const items = screen.getAllByRole('listitem');
    expect(items[1]!.getAttribute('aria-current')).toBe('step');
    expect(items[0]!.textContent).toContain('(done)');
    expect(items[2]!.textContent).toContain('(to do)');
  });
  it('shows an override such as Refunded', () => {
    render(<OrderProgress steps={steps} done={0} label="Progress" overrideText="Refunded" />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('Refunded')).toBeTruthy();
  });
});

describe('Slideshow', () => {
  const labels = {
    previous: 'Previous',
    next: 'Next',
    pause: 'Pause',
    play: 'Play',
    slide: 'Slide {n} of {total}',
  };
  const slides = ['A', 'B', 'C'].map((x) => ({ id: x, content: <p>Slide {x}</p> }));
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-advances, and stops when paused (FR-HOME-02/03)', () => {
    render(<Slideshow slides={slides} label="Featured" labels={labels} />);
    expect(screen.getByText('Slide A')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(5500));
    expect(screen.getByText('Slide B').closest('[hidden]')).toBeNull();
    fireEvent.click(screen.getByLabelText('Pause'));
    act(() => void vi.advanceTimersByTime(20_000));
    expect(screen.getByText('Slide B').closest('[hidden]')).toBeNull();
  });

  it('pauses on hover and supports next, previous, dots and arrow keys', () => {
    const { container } = render(<Slideshow slides={slides} label="Featured" labels={labels} />);
    const region = container.querySelector('section')!;
    fireEvent.mouseEnter(region);
    act(() => void vi.advanceTimersByTime(20_000));
    expect(screen.getByText('Slide A').closest('[hidden]')).toBeNull();
    fireEvent.click(screen.getByLabelText('Previous'));
    expect(screen.getByText('Slide C').closest('[hidden]')).toBeNull();
    fireEvent.click(screen.getAllByLabelText('Slide 2 of 3').find((e) => e.tagName === 'BUTTON')!);
    expect(screen.getByText('Slide B').closest('[hidden]')).toBeNull();
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByText('Slide C').closest('[hidden]')).toBeNull();
  });

  it('never auto-advances under reduced motion', () => {
    const mm = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', mm);
    render(<Slideshow slides={slides} label="Featured" labels={labels} />);
    act(() => void vi.advanceTimersByTime(20_000));
    expect(screen.getByText('Slide A').closest('[hidden]')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('Toast, EmptyState, BottomTabBar', () => {
  it('announces a toast and removes it after a while (FR-CART-04)', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider durationMs={1000}>
        <ToastOnMount text="Added to cart" />
      </ToastProvider>,
    );
    expect(screen.getByText('Added to cart')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByText('Added to cart')).toBeNull();
    vi.useRealTimers();
  });

  it('renders an empty state with its action (FR-SRCH-03)', () => {
    render(<EmptyState title='No results for "xyz"' action={<button>Clear search</button>} />);
    expect(screen.getByRole('status').textContent).toContain('xyz');
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
  });

  it('marks the active tab and shows the cart count', () => {
    render(
      <BottomTabBar
        label="Main"
        activeHref="/cart"
        items={[
          { href: '/', label: 'Home' },
          { href: '/cart', label: 'Cart', badge: 3, badgeLabel: 'items' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: /Cart/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Cart/ }).textContent).toContain('3');
  });
});
