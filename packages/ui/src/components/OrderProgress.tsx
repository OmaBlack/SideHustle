import { cx } from '../format.js';

export interface OrderProgressProps {
  /** The four buyer-facing steps (FR-ORD-02): Paid, Confirmed by vendor, Dispatched, Delivered. */
  steps: readonly [string, string, string, string];
  /** How many steps are done, 0–4. */
  done: number;
  label: string;
  /** Replaces the steps, e.g. "Refunded" for a rejected fulfilment. */
  overrideText?: string;
}

/** Four-step progress indicator (FR-ORD-03). An ordered list, so screen readers hear each step and its state. */
export function OrderProgress({ steps, done, label, overrideText }: OrderProgressProps) {
  if (overrideText) {
    return (
      <p className="rounded-field bg-warn-soft px-3 py-2 text-[13px] font-semibold text-warn">
        {overrideText}
      </p>
    );
  }
  return (
    <ol aria-label={label} className="grid grid-cols-4 gap-1">
      {steps.map((s, i) => {
        const complete = i < done;
        const current = i === done - 1;
        return (
          <li
            key={s}
            aria-current={current ? 'step' : undefined}
            className="flex min-w-0 flex-col gap-1 text-[11.5px] leading-tight"
          >
            <span className={cx('h-1.5 rounded-full', complete ? 'bg-accent' : 'bg-line')} />
            <span className={cx(complete ? 'font-bold text-ink' : 'text-muted')}>
              {s}
              <span className="sr-only">{complete ? ' (done)' : ' (to do)'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
