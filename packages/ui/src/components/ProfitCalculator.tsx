'use client';
import { useId, useState } from 'react';
import { formatNaira } from '../format.js';

export interface ProfitCalculatorProps {
  /** Price paid per unit (effective price plus add-ons). */
  unitCostKobo: number;
  qty: number;
  /** Default resale price per unit (FR-PROD-07). */
  rrpKobo: number;
  labels: { title: string; resale: string; cost: string; revenue: string; profit: string; estimate: string };
}

/**
 * FR-PROD-07: given a resale price per unit, show cost, revenue if every unit
 * sells, and profit. The buyer types naira; maths stays in kobo.
 */
export function ProfitCalculator({ unitCostKobo, qty, rrpKobo, labels }: ProfitCalculatorProps) {
  const id = useId();
  const [naira, setNaira] = useState(String(Math.round(rrpKobo / 100)));
  const resaleKobo = Math.max(0, Math.floor(Number(naira) || 0)) * 100;
  const cost = unitCostKobo * qty;
  const revenue = resaleKobo * qty;
  const profit = revenue - cost;
  return (
    <section
      aria-labelledby={`${id}-t`}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
    >
      <h2 id={`${id}-t`} className="text-base font-extrabold">
        {labels.title}
      </h2>
      <label htmlFor={`${id}-r`} className="text-[13px] font-semibold">
        {labels.resale}
      </label>
      <div className="flex overflow-hidden rounded-field border border-line bg-surface">
        <span aria-hidden="true" className="bg-sunk px-3 py-2.5 font-semibold">
          ₦
        </span>
        <input
          id={`${id}-r`}
          inputMode="numeric"
          className="min-h-11 w-full min-w-0 border-0 bg-transparent px-3 text-ink outline-none"
          value={naira}
          onChange={(e) => setNaira(e.target.value.replace(/[^\d]/g, ''))}
        />
      </div>
      <dl aria-live="polite" className="grid grid-cols-3 gap-2 text-[13px]">
        <div>
          <dt className="text-muted">{labels.cost}</dt>
          <dd className="font-bold tabular-nums">{formatNaira(cost)}</dd>
        </div>
        <div>
          <dt className="text-muted">{labels.revenue}</dt>
          <dd className="font-bold tabular-nums">{formatNaira(revenue)}</dd>
        </div>
        <div>
          <dt className="text-muted">{labels.profit}</dt>
          <dd
            className={profit < 0 ? 'font-bold tabular-nums text-danger' : 'font-bold tabular-nums text-good'}
          >
            {profit < 0 ? `−${formatNaira(-profit)}` : formatNaira(profit)}
          </dd>
        </div>
      </dl>
      <p className="text-[12px] text-muted">{labels.estimate}</p>
    </section>
  );
}
