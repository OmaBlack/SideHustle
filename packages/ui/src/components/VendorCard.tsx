import { cx } from '../format.js';
import { UiLink } from './Link.js';
import { Monogram } from './Monogram.js';

export interface VendorCardProps {
  href: string;
  name: string;
  location: string;
  color?: string | null;
  /** e.g. "12 products · ★ 4.9" */
  statsText: string;
  verifiedText?: string;
  customText?: string;
  className?: string;
}

/** FR-VEN-01/06: name, location, product count, rating, "Takes custom orders" and the verified badge. */
export function VendorCard(v: VendorCardProps) {
  return (
    <article
      className={cx(
        'relative flex min-w-0 items-start gap-3 rounded-card border border-line bg-surface p-4',
        v.className,
      )}
    >
      <Monogram name={v.name} color={v.color} />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-[15px] font-bold">
          <UiLink
            href={v.href}
            className="text-ink no-underline after:absolute after:inset-0 after:content-['']"
          >
            {v.name}
          </UiLink>
        </h3>
        <p className="text-[12.5px] text-muted">{v.location}</p>
        <p className="text-[12.5px] tabular-nums">{v.statsText}</p>
        <div className="flex flex-wrap gap-1.5">
          {v.verifiedText && (
            <span className="rounded-md bg-good-soft px-1.5 py-0.5 text-xs font-bold text-good">
              ✓ {v.verifiedText}
            </span>
          )}
          {v.customText && (
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-accent">
              {v.customText}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
