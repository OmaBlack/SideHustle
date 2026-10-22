'use client';
import { Slideshow } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Slide } from '@/lib/types';

const HOUSE: Record<string, { href: string; tone: string }> = {
  start: { href: '/signup', tone: 'bg-deep text-on-deep' },
  build: { href: '/build', tone: 'bg-accent text-on-accent' },
  vendor: { href: '/vendor', tone: 'bg-gold text-on-gold' },
  goal: { href: '/goal', tone: 'bg-deep text-on-deep' },
};

/** FR-HOME-01..03: house slides and up to two live deals. */
export function HomeSlideshow({ slides, loggedInStart }: { slides: Slide[]; loggedInStart?: boolean }) {
  const t = useTranslations('slides');
  return (
    <Slideshow
      label={t('label')}
      labels={{
        previous: t('previous'),
        next: t('next'),
        pause: t('pause'),
        play: t('play'),
        slide: t('slide'),
      }}
      slides={slides.map((s) => {
        if (s.type === 'deal') {
          const d = s.deal;
          return {
            id: s.key,
            content: (
              <div
                className="flex min-h-[200px] flex-col justify-end gap-2 rounded-card p-5 text-white"
                style={{ background: d.vendor.color ?? 'var(--deep)' }}
              >
                <p className="text-[13px] font-bold uppercase tracking-wide opacity-90">
                  {d.kind === 'promo' ? t('promo', { pct: d.discountPct }) : t('launch')} · {d.vendor.name}
                </p>
                <p className="font-display text-[clamp(22px,5vw,32px)] font-extrabold leading-tight">
                  {d.headline}
                </p>
                {d.detail && <p className="max-w-[52ch] text-[14px] opacity-90">{d.detail}</p>}
                <Link
                  href={d.product ? `/products/${d.product.slug}` : `/vendors/${d.vendor.slug}`}
                  className="self-start rounded-full bg-white px-4 py-2.5 font-bold text-black no-underline"
                >
                  {t('shopDeal')}
                </Link>
              </div>
            ),
          };
        }
        const h = HOUSE[s.key] ?? HOUSE.start!;
        const href = s.key === 'start' && loggedInStart ? '/kits' : h.href;
        return {
          id: s.key,
          content: (
            <div className={`flex min-h-[200px] flex-col justify-end gap-2 rounded-card p-5 ${h.tone}`}>
              <p className="font-display text-[clamp(22px,5vw,32px)] font-extrabold leading-tight">
                {t(`${s.key}.title`)}
              </p>
              <p className="max-w-[52ch] text-[14px]">{t(`${s.key}.body`)}</p>
              <Link
                href={href}
                className="self-start rounded-full bg-surface px-4 py-2.5 font-bold text-ink no-underline"
              >
                {t(`${s.key}.cta`)}
              </Link>
            </div>
          ),
        };
      })}
    />
  );
}
