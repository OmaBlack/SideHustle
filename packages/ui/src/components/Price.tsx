import { cx, formatNaira } from '../format.js';

export interface PriceProps {
  unitKobo: number;
  /** Shown struck through when it differs from unitKobo (AC-04). */
  originalKobo?: number;
  discountPct?: number;
  /** Screen-reader text before the original price, e.g. "was". */
  wasLabel: string;
  size?: 'md' | 'lg';
  className?: string;
}

export function Price({ unitKobo, originalKobo, discountPct, wasLabel, size = 'md', className }: PriceProps) {
  const discounted = originalKobo !== undefined && originalKobo > unitKobo;
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-1.5 tabular-nums', className)}>
      <span
        className={cx('font-bold', size === 'lg' ? 'font-display text-[26px] font-extrabold' : 'text-base')}
      >
        {formatNaira(unitKobo)}
      </span>
      {discounted && (
        <>
          <s className="text-[12.5px] text-muted">
            <span className="sr-only">{wasLabel} </span>
            {formatNaira(originalKobo)}
          </s>
          {discountPct ? (
            <span className="rounded-md bg-danger px-1.5 py-0.5 text-xs font-extrabold text-on-danger">
              −{discountPct}%
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}
