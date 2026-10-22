import { formatNaira } from '@sidehustle/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Page } from '@/components/Page';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

const GOALS = [5_000_000, 10_000_000, 25_000_000, 50_000_000];

export async function generateMetadata() {
  return { title: (await getTranslations('goal'))('title') };
}

/** FR-GOAL-01..03, UC-3. Plain links, so it works without JavaScript. */
export default async function GoalPage({ searchParams }: { searchParams: Promise<{ amount?: string }> }) {
  const t = await getTranslations('goal');
  const sp = await searchParams;
  const amount = GOALS.includes(Number(sp.amount)) ? Number(sp.amount) : GOALS[1]!;
  const { rows } = await serverApi<{
    rows: {
      kitId: string;
      slug: string;
      name: string;
      kitsPerMonth: number;
      priceKobo: number;
      profitKobo: number;
    }[];
  }>(`/kits/goal?amount=${amount}`);
  return (
    <Page title={t('title')} lead={t('lead')}>
      <nav aria-label={t('pick')} className="flex flex-wrap gap-2">
        {GOALS.map((g) => (
          <Link
            key={g}
            href={`/goal?amount=${g}`}
            aria-current={g === amount ? 'page' : undefined}
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 font-semibold text-muted no-underline aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-bg"
          >
            {t('perMonth', { amount: formatNaira(g) })}
          </Link>
        ))}
      </nav>
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li
            key={r.kitId}
            className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4"
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-soft font-extrabold text-accent"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/kits/${r.slug}`} className="text-[16px] font-bold text-ink">
                {r.name}
              </Link>
              <p className="text-[13px] text-muted">
                {t('capital', { price: formatNaira(r.priceKobo), profit: formatNaira(r.profitKobo) })}
              </p>
            </div>
            <p className="text-right">
              <span className="block font-display text-2xl font-extrabold tabular-nums">
                {r.kitsPerMonth}
              </span>
              <span className="text-[12.5px] text-muted">{t('kitsPerMonth', { count: r.kitsPerMonth })}</span>
            </p>
          </li>
        ))}
      </ol>
      <p className="text-[12.5px] text-muted">{t('estimate')}</p>
    </Page>
  );
}
