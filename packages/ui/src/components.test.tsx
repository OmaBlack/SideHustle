import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Chip, Field, MarginBadge, PhoneInput, Price, StateSelect, Stepper, formatNaira } from './index.js';

afterEach(cleanup);

describe('formatNaira', () => {
  it('shows whole naira with the naira sign and en-NG grouping', () => {
    expect(formatNaira(176_000)).toBe('₦1,760');
    expect(formatNaira(12_500_000)).toBe('₦125,000');
  });
});

describe('Price', () => {
  it('strikes through the original and announces it (AC-04)', () => {
    render(<Price unitKobo={176_000} originalKobo={220_000} discountPct={20} wasLabel="was" />);
    expect(screen.getByText('₦1,760')).toBeTruthy();
    expect(screen.getByText('₦2,200').closest('s')).toBeTruthy();
    expect(screen.getByText('was')).toBeTruthy();
    expect(screen.getByText('−20%')).toBeTruthy();
  });
  it('shows a single price when there is no discount', () => {
    const { container } = render(<Price unitKobo={220_000} originalKobo={220_000} wasLabel="was" />);
    expect(container.querySelector('s')).toBeNull();
  });
});

function StepperHarness({ onCorrected }: { onCorrected: (n: number) => void }) {
  const [v, setV] = useState(20);
  return (
    <Stepper
      value={v}
      min={20}
      onChange={setV}
      onCorrected={onCorrected}
      labels={{ decrease: 'Fewer', increase: 'More', quantity: 'Quantity' }}
    />
  );
}

describe('Stepper', () => {
  it('cannot step below the MOQ and corrects a typed value up to it (AC-03)', () => {
    const corrected = vi.fn();
    render(<StepperHarness onCorrected={corrected} />);
    const input = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect((screen.getByLabelText('Fewer') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('More'));
    expect(input.value).toBe('21');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(input.value).toBe('20');
    expect(corrected).toHaveBeenCalledWith(20);
  });
});

describe('Field and inputs', () => {
  it('ties label, hint and error to the control', () => {
    render(
      <Field label="Business name" hint="As customers will see it" error="Required">
        {(c) => <input {...c} />}
      </Field>,
    );
    const input = screen.getByLabelText('Business name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map((id) => document.getElementById(id)!.textContent)).toEqual([
      'As customers will see it',
      'Required',
    ]);
  });

  it('PhoneInput is a labelled tel input', () => {
    render(<PhoneInput label="Phone number" />);
    expect(screen.getByLabelText('Phone number').getAttribute('type')).toBe('tel');
  });

  it('StateSelect lists the states after a placeholder', () => {
    render(<StateSelect label="State" placeholder="Choose a state" states={['Lagos', 'Ogun']} />);
    const opts = [...(screen.getByLabelText('State') as HTMLSelectElement).options].map((o) => o.text);
    expect(opts).toEqual(['Choose a state', 'Lagos', 'Ogun']);
  });
});

describe('Chip and MarginBadge', () => {
  it('Chip exposes its pressed state', () => {
    render(<Chip selected>Beauty</Chip>);
    expect(screen.getByRole('button', { name: 'Beauty' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('MarginBadge renders its text', () => {
    render(<MarginBadge>50% margin</MarginBadge>);
    expect(screen.getByText('50% margin')).toBeTruthy();
  });
});
