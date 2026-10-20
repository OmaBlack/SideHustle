'use client';
import type { InputHTMLAttributes } from 'react';
import { Field } from './Field.js';

export interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> {
  label: string;
  hint?: string;
  error?: string;
}

/** Nigerian mobile number with a fixed +234 prefix. The API normalises what is typed to E.164. */
export function PhoneInput({ label, hint, error, ...rest }: PhoneInputProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <div className="flex overflow-hidden rounded-field border border-line bg-surface">
          <span aria-hidden="true" className="bg-sunk px-2.5 py-2.5 text-sm font-semibold">
            +234
          </span>
          <input
            {...control}
            {...rest}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            className="min-h-11 w-full min-w-0 border-0 bg-transparent px-3 text-ink outline-none"
          />
        </div>
      )}
    </Field>
  );
}
