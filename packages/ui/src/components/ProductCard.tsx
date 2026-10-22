import { cx } from '../format.js';
import { UiLink } from './Link.js';
import { MarginBadge } from './MarginBadge.js';
import { Price } from './Price.js';
import { ProductArt } from './ProductArt.js';

export interface ProductCardProps {
  href: string;
  name: string;
  vendorName: string;
  location: string;
  unitKobo: number;
  originalKobo?: number;
  discountPct?: number;
  moqText: string;
  marginText: string;
  customisableText?: string;
  shape?: string | null;
  category?: string | null;
  wasLabel: string;
  className?: string;
}

/** FR-PROD-01/02: name, vendor and location, price per unit, MOQ, margin, "Customisable" badge, promo price. */
export function ProductCard(p: ProductCardProps) {
  return (
    <article
      className={cx(
        'relative flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-3',
        p.className,
      )}
    >
      <ProductArt shape={p.shape} category={p.category} className="aspect-square w-full" />
      <h3 className="text-[15px] font-bold leading-snug">
        <UiLink
          href={p.href}
          className="text-ink no-underline after:absolute after:inset-0 after:content-['']"
        >
          {p.name}
        </UiLink>
      </h3>
      <p className="text-[12.5px] text-muted">
        {p.vendorName} · {p.location}
      </p>
      <Price
        unitKobo={p.unitKobo}
        originalKobo={p.originalKobo}
        discountPct={p.discountPct}
        wasLabel={p.wasLabel}
      />
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="text-muted">{p.moqText}</span>
        <MarginBadge>{p.marginText}</MarginBadge>
        {p.customisableText && (
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-accent">
            {p.customisableText}
          </span>
        )}
      </div>
    </article>
  );
}
