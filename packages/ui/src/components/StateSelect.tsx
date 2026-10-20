'use client';
import type { SelectHTMLAttributes } from 'react';
import { Field, controlClass } from './Field.js';

export interface StateSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  states: readonly string[];
  placeholder: string;
  hint?: string;
  error?: string;
}

export function StateSelect({ label, states, placeholder, hint, error, ...rest }: StateSelectProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <select {...control} {...rest} className={controlClass}>
          <option value="">{placeholder}</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
