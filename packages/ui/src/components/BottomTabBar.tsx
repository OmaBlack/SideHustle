import { cx } from '../format.js';
import { UiLink } from './Link.js';

export interface TabItem {
  href: string;
  label: string;
  /** Optional count, e.g. cart lines (FR-CART-04). */
  badge?: number;
  badgeLabel?: string;
}

export interface BottomTabBarProps {
  items: readonly TabItem[];
  activeHref?: string;
  label: string;
  className?: string;
}

/** Mobile bottom navigation; hidden from 768px where the header nav takes over. */
export function BottomTabBar({ items, activeHref, label, className }: BottomTabBarProps) {
  return (
    <nav
      aria-label={label}
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden',
        className,
      )}
    >
      <ul
        className="mx-auto grid max-w-[600px]"
        style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
      >
        {items.map((it) => {
          const active = activeHref === it.href;
          return (
            <li key={it.href}>
              <UiLink
                href={it.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold no-underline',
                  active ? 'text-accent' : 'text-muted',
                )}
              >
                <span className="relative">
                  {it.label}
                  {it.badge ? (
                    <span className="ml-1 rounded-full bg-gold px-1.5 text-[10.5px] font-extrabold text-on-gold">
                      {it.badge}
                      {it.badgeLabel && <span className="sr-only"> {it.badgeLabel}</span>}
                    </span>
                  ) : null}
                </span>
              </UiLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
