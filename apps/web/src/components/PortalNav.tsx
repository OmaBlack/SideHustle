'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Sub-navigation for the vendor portal and admin console. */
export function PortalNav({
  ns,
  items,
}: {
  ns: 'vendorPortal' | 'admin';
  items: { href: string; key: string }[];
}) {
  const t = useTranslations(ns);
  const path = usePathname();
  return (
    <nav aria-label={t('nav')} className="border-b border-line bg-surface">
      <ul className="mx-auto flex max-w-[1080px] gap-1 overflow-x-auto px-4 py-1.5">
        {items.map((i) => {
          const active =
            i.href === path ||
            (i.href !== `/${ns === 'admin' ? 'admin' : 'vendor'}` && path.startsWith(i.href));
          return (
            <li key={i.href} className="flex-none">
              <Link
                href={i.href}
                aria-current={active ? 'page' : undefined}
                className="inline-flex min-h-11 items-center rounded-full px-3 text-[14px] font-semibold text-muted no-underline aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
              >
                {t(`navItems.${i.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
