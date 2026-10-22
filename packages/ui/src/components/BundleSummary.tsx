import { formatNaira } from '../format.js';
import { MarginBadge } from './MarginBadge.js';

export interface BundleSummaryProps {
  costKobo: number;
  discountKobo: number;
  payKobo: number;
  retailKobo: number;
  profitKobo: number;
  marginPct: number;
  labels: {
    title: string;
    cost: string;
    discount: string;
    pay: string;
    resale: string;
    profit: string;
    margin: string;
    /** e.g. "Spend ₦12,000 more for 5% off" — shown when there is no discount yet. */
    hint?: string;
    estimate: string;
  };
}

/** FR-BLD-03: live cost, bundle discount, amount to pay, resale value, profit and margin. */
export function BundleSummary({ labels, ...b }: BundleSummaryProps) {
  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? 'text-lg font-extrabold tabular-nums' : 'font-semibold tabular-nums'}>
        {value}
      </dd>
    </div>
  );
  return (
    <section aria-label={labels.title} className="flex flex-col gap-2 rounded-card bg-deep p-4 text-on-deep">
      <h2 className="text-base font-extrabold">{labels.title}</h2>
      <dl aria-live="polite" className="flex flex-col gap-1.5 text-[13.5px] [&_dt]:text-on-deep/80">
        {row(labels.cost, formatNaira(b.costKobo))}
        {row(labels.discount, b.discountKobo > 0 ? `−${formatNaira(b.discountKobo)}` : formatNaira(0))}
        {row(labels.pay, formatNaira(b.payKobo), true)}
        {row(labels.resale, formatNaira(b.retailKobo))}
        {row(labels.profit, formatNaira(b.profitKobo))}
      </dl>
      <div>
        <MarginBadge>{labels.margin.replace('{pct}', String(b.marginPct))}</MarginBadge>
      </div>
      {labels.hint && <p className="text-[12.5px]">{labels.hint}</p>}
      <p className="text-[11.5px] opacity-80">{labels.estimate}</p>
    </section>
  );
}
