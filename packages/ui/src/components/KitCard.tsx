import { cx, formatNaira } from '../format.js';
import { UiLink } from './Link.js';
import { MarginBadge } from './MarginBadge.js';
import { categoryColor } from './ProductArt.js';

export interface KitCardProps {
  href: string;
  name: string;
  category?: string | null;
  priceKobo: number;
  retailKobo: number;
  profitKobo: number;
  marginText: string;
  /** e.g. "82 units · 3 products" */
  contentsText: string;
  labels: { price: string; resale: string; profit: string };
  unavailableText?: string;
  className?: string;
}

/** FR-KIT-02: total units, number of products, kit price, resale value, profit and margin. */
export function KitCard(k: KitCardProps) {
  return (
    <article
      className={cx(
        'relative flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4',
        k.className,
      )}
      style={{ borderTop: `4px solid ${categoryColor(k.category)}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-extrabold">
          <UiLink
            href={k.href}
            className="text-ink no-underline after:absolute after:inset-0 after:content-['']"
          >
            {k.name}
          </UiLink>
        </h3>
        <MarginBadge>{k.marginText}</MarginBadge>
      </div>
      <p className="text-[13px] text-muted">{k.contentsText}</p>
      <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
        <div>
          <dt className="text-muted">{k.labels.price}</dt>
          <dd className="font-bold tabular-nums">{formatNaira(k.priceKobo)}</dd>
        </div>
        <div>
          <dt className="text-muted">{k.labels.resale}</dt>
          <dd className="font-bold tabular-nums">{formatNaira(k.retailKobo)}</dd>
        </div>
        <div>
          <dt className="text-muted">{k.labels.profit}</dt>
          <dd className="font-bold tabular-nums text-good">{formatNaira(k.profitKobo)}</dd>
        </div>
      </dl>
      {k.unavailableText && (
        <p className="rounded-field bg-warn-soft px-2 py-1 text-[12.5px] font-semibold text-warn">
          {k.unavailableText}
        </p>
      )}
    </article>
  );
}
