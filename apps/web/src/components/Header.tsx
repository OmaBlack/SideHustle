'use client';
import { BottomTabBar } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart, useMe } from '@/lib/session';

/** Site header (desktop nav) and the mobile bottom tab bar, with the cart line count (FR-CART-04). */
export function Header() {
  const t = useTranslations('nav');
  const path = usePathname();
  const me = useMe();
  const cart = useCart(!!me.data);
  const count = cart.data?.count ?? 0;
  const user = me.data;
  const links = [
    { href: '/kits', label: t('kits') },
    { href: '/build', label: t('build') },
    { href: '/goal', label: t('goal') },
    { href: '/vendors', label: t('vendors') },
  ];
  const portal =
    user?.role === 'admin'
      ? { href: '/admin', label: t('admin') }
      : user?.vendorId
        ? { href: '/vendor', label: t('vendorPortal') }
        : null;
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-4 py-2.5">
          <Link href="/" className="font-display text-xl font-extrabold text-ink no-underline">
            Side<span className="text-accent">Hustle</span>
          </Link>
          <nav aria-label={t('main')} className="ml-4 hidden gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active(l.href) ? 'page' : undefined}
                className="rounded-full px-3 py-2 text-[14px] font-semibold text-muted no-underline aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {portal && (
              <Link
                href={portal.href}
                className="hidden rounded-full px-3 py-2 text-[14px] font-semibold text-ink no-underline md:inline-flex"
              >
                {portal.label}
              </Link>
            )}
            <Link
              href="/cart"
              // Phones use the bottom tab bar for Cart and Log in, so the header shows them from md up only.
              className="hidden min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-ink no-underline md:inline-flex"
            >
              {t('cart')}
              <span
                className="rounded-full bg-gold px-2 text-[12px] font-extrabold text-on-gold"
                aria-label={t('cartCount', { count })}
              >
                {count}
              </span>
            </Link>
            {user ? (
              <Link
                href="/account"
                className="hidden min-h-11 items-center rounded-full px-3 font-semibold text-ink no-underline md:inline-flex"
              >
                {t('account')}
              </Link>
            ) : (
              <Link
                href="/login"
                className="hidden min-h-11 items-center rounded-full bg-accent px-4 font-bold text-on-accent no-underline md:inline-flex"
              >
                {t('login')}
              </Link>
            )}
          </div>
        </div>
      </header>
      <BottomTabBar
        label={t('main')}
        activeHref={[...links, { href: '/' }, { href: '/cart' }, { href: '/account' }]
          .map((l) => l.href)
          .find((h) => (h === '/' ? path === '/' : path.startsWith(h)))}
        items={[
          { href: '/', label: t('home') },
          { href: '/kits', label: t('kits') },
          { href: '/build', label: t('build') },
          { href: '/cart', label: t('cart'), badge: count, badgeLabel: t('cartItems') },
          user
            ? { href: portal?.href ?? '/account', label: portal ? portal.label : t('account') }
            : { href: '/login', label: t('login') },
        ]}
      />
    </>
  );
}
