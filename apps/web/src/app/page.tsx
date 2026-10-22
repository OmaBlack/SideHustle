import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { KitTile, VendorTile, wideGrid } from '@/components/cards';
import { HashRedirect } from '@/components/HashRedirect';
import { HomeSlideshow } from '@/components/HomeSlideshow';
import { Section } from '@/components/Page';
import { ProductGrid } from '@/components/ProductGrid';
import { StartButton } from '@/components/StartButton';
import { serverApi } from '@/lib/server-api';
import type { Category, KitView, ProductView, Slide, VendorListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const t = await getTranslations('home');
  const [{ slides }, { categories }, { kits }, { vendors }, { products }] = await Promise.all([
    serverApi<{ slides: Slide[] }>('/slides'),
    serverApi<{ categories: Category[] }>('/categories'),
    serverApi<{ kits: KitView[] }>('/kits'),
    serverApi<{ vendors: VendorListItem[] }>('/vendors'),
    serverApi<{ products: ProductView[] }>('/products'),
  ]);
  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-8 px-4 py-6">
      <HashRedirect />
      <div className="flex flex-col gap-3">
        <h1 className="text-[clamp(28px,6vw,42px)] font-extrabold">{t('title')}</h1>
        <p className="max-w-[60ch] text-muted">{t('lead')}</p>
      </div>
      <HomeSlideshow slides={slides} />
      <Section
        title={t('kits')}
        id="kits"
        action={
          <Link href="/kits" className="font-semibold text-accent">
            {t('seeAll')}
          </Link>
        }
      >
        <div className={wideGrid}>
          {kits.slice(0, 3).map((k) => (
            <KitTile key={k.id} k={k} />
          ))}
        </div>
      </Section>
      <Section title={t('how')} id="how">
        <ol className="grid gap-3 sm:grid-cols-3">
          {(['one', 'two', 'three'] as const).map((k, i) => (
            <li key={k} className="flex gap-3 rounded-card border border-line bg-surface p-4">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent font-extrabold text-on-accent"
              >
                {i + 1}
              </span>
              <span>
                <span className="block font-bold">{t(`steps.${k}.title`)}</span>
                <span className="text-[13.5px] text-muted">{t(`steps.${k}.body`)}</span>
              </span>
            </li>
          ))}
        </ol>
        <div>
          <StartButton />
        </div>
      </Section>
      <Section
        title={t('vendors')}
        id="vendors"
        action={
          <Link href="/vendors" className="font-semibold text-accent">
            {t('seeAll')}
          </Link>
        }
      >
        <div className={wideGrid}>
          {vendors
            .filter((v) => v.featured)
            .slice(0, 6)
            .map((v) => (
              <VendorTile key={v.id} v={v} />
            ))}
        </div>
      </Section>
      <Section title={t('market')} id="market">
        <ProductGrid initial={products} categories={categories} />
      </Section>
      <p className="text-[12.5px] text-muted">{t('estimate')}</p>
    </main>
  );
}
