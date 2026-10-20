'use client';
import { NIGERIAN_STATES } from '@sidehustle/schemas';
import {
  Button,
  Chip,
  Field,
  MarginBadge,
  PhoneInput,
  Price,
  StateSelect,
  Stepper,
  controlClass,
} from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 className="text-[23px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function Showcase() {
  const t = useTranslations('styleguide');
  const [cat, setCat] = useState('all');
  const [qty, setQty] = useState(20);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title={t('buttons')}>
        <div className="flex flex-wrap gap-2">
          <Button>{t('primary')}</Button>
          <Button variant="gold">{t('gold')}</Button>
          <Button variant="ghost">{t('ghost')}</Button>
          <Button variant="danger" size="sm">
            {t('danger')}
          </Button>
          <Button disabled>{t('disabled')}</Button>
        </div>
      </Section>

      <Section title={t('chips')}>
        <div className="flex gap-1.5 overflow-x-auto">
          {(['all', 'beauty', 'fashion'] as const).map((c) => (
            <Chip key={c} selected={cat === c} onClick={() => setCat(c)}>
              {t(c)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t('fields')}>
        <Field label={t('businessName')} hint={t('businessNameHint')}>
          {(c) => <input {...c} className={controlClass} />}
        </Field>
        <PhoneInput label={t('phone')} error={t('phoneError')} defaultValue="0601" />
        <StateSelect label={t('state')} placeholder={t('statePlaceholder')} states={NIGERIAN_STATES} />
      </Section>

      <Section title={t('stepper')}>
        <p className="text-sm text-muted">{t('minOrder', { min: 20 })}</p>
        <Stepper
          value={qty}
          min={20}
          onChange={(v) => {
            setQty(v);
            setNote(null);
          }}
          onCorrected={(min) => setNote(t('moqCorrected', { min }))}
          labels={{ decrease: t('decrease'), increase: t('increase'), quantity: t('stepper') }}
        />
        <p role="status" className="min-h-5 text-[13px] text-warn">
          {note}
        </p>
      </Section>

      <Section title={t('prices')}>
        <div className="flex flex-col gap-2">
          <Price unitKobo={176_000} originalKobo={220_000} discountPct={20} wasLabel={t('was')} />
          <Price unitKobo={12_500_000} wasLabel={t('was')} size="lg" />
          <div>
            <MarginBadge>{t('margin', { pct: 50 })}</MarginBadge>
          </div>
          <p className="text-[12.5px] text-muted">{t('estimate')}</p>
        </div>
      </Section>
    </div>
  );
}
