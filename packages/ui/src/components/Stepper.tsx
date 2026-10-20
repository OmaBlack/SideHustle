'use client';
import { useEffect, useState } from 'react';

export interface StepperProps {
  value: number;
  /** The MOQ; values below it are corrected up (AC-03). */
  min: number;
  max?: number;
  onChange: (value: number) => void;
  /** Called when a typed value was corrected to the MOQ, so the page can say so. */
  onCorrected?: (min: number) => void;
  labels: { decrease: string; increase: string; quantity: string };
}

/** Quantity stepper that never goes below the MOQ. */
export function Stepper({ value, min, max, onChange, onCorrected, labels }: StepperProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const clamp = (n: number) => Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, n));

  const commit = () => {
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < min) {
      onChange(min);
      setDraft(String(min));
      onCorrected?.(min);
      return;
    }
    const c = clamp(n);
    setDraft(String(c));
    if (c !== value) onChange(c);
  };

  const btn =
    'h-11 w-11 cursor-pointer border-0 bg-transparent text-lg disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="inline-flex items-center overflow-hidden rounded-full border border-line bg-surface">
      <button
        type="button"
        className={btn}
        aria-label={labels.decrease}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <input
        aria-label={labels.quantity}
        inputMode="numeric"
        className="w-16 border-0 bg-transparent p-0 text-center font-bold tabular-nums"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <button
        type="button"
        className={btn}
        aria-label={labels.increase}
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  );
}
