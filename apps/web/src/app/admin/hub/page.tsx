'use client';
import { Button } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminGate } from '@/components/AdminGate';
import { TableScroll } from '@/components/Page';
import { FormError, useSubmit } from '@/components/forms';
import { useAdminQuery } from '@/lib/admin';
import { post, put } from '@/lib/api';

interface Item {
  productId: string;
  name: string;
  vendor: string;
  mode: 'drop_ship' | 'hub';
  onHand: number;
  available: number;
  lowStockThreshold: number;
  low: boolean;
}

/** FR-ADM-07: receive, count and adjust hub stock, set thresholds, move a product to the hub. */
export default function Hub() {
  const t = useTranslations('admin');
  const qc = useQueryClient();
  const q = useAdminQuery<{ items: Item[] }>(['hub'], '/admin/hub-stock');
  const [draft, setDraft] = useState<Record<string, { receive: string; count: string; threshold: string }>>(
    {},
  );
  const s = useSubmit();
  const refresh = () => qc.invalidateQueries({ queryKey: ['hub'] });
  const val = (id: string, k: 'receive' | 'count' | 'threshold') => draft[id]?.[k] ?? '';
  const set = (id: string, k: 'receive' | 'count' | 'threshold', v: string) =>
    setDraft({
      ...draft,
      [id]: { receive: '', count: '', threshold: '', ...draft[id], [k]: v.replace(/\D/g, '') },
    });
  const input = 'h-11 w-20 rounded-field border border-line bg-surface px-2 text-ink';
  return (
    <AdminGate title={t('hubTitle')} denied={q.denied} ready={!!q.data} lead={t('hubLead')}>
      <FormError error={s.error} />
      <TableScroll label={t('hubTitle')}>
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead className="text-muted">
            <tr>
              <th className="py-2">{t('product')}</th>
              <th>{t('mode')}</th>
              <th>{t('onHand')}</th>
              <th>{t('available')}</th>
              <th>{t('receive')}</th>
              <th>{t('count')}</th>
              <th>{t('threshold')}</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.items ?? []).map((i) => (
              <tr key={i.productId} className="border-t border-line align-middle">
                <td className="py-2">
                  <span className="block font-semibold">{i.name}</span>
                  <span className="text-muted">{i.vendor}</span>
                </td>
                <td>
                  {i.mode === 'hub' ? (
                    t('modeHub')
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (
                          await s.run(() =>
                            put(`/admin/products/${i.productId}/fulfilment-mode`, { mode: 'hub' }),
                          )
                        )
                          await refresh();
                      }}
                    >
                      {t('moveToHub')}
                    </Button>
                  )}
                </td>
                <td className="tabular-nums">{i.mode === 'hub' ? i.onHand : '–'}</td>
                <td className={i.low ? 'font-bold text-danger tabular-nums' : 'tabular-nums'}>
                  {i.mode === 'hub' ? `${i.available}${i.low ? ` (${t('low')})` : ''}` : '–'}
                </td>
                {i.mode === 'hub' ? (
                  <>
                    <td>
                      <span className="flex gap-1">
                        <input
                          aria-label={t('receiveFor', { name: i.name })}
                          className={input}
                          inputMode="numeric"
                          value={val(i.productId, 'receive')}
                          onChange={(e) => set(i.productId, 'receive', e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (
                              await s.run(() =>
                                post('/admin/hub-stock/receive', {
                                  productId: i.productId,
                                  qty: Number(val(i.productId, 'receive')),
                                }),
                              )
                            ) {
                              set(i.productId, 'receive', '');
                              await refresh();
                            }
                          }}
                        >
                          {t('add')}
                        </Button>
                      </span>
                    </td>
                    <td>
                      <span className="flex gap-1">
                        <input
                          aria-label={t('countFor', { name: i.name })}
                          className={input}
                          inputMode="numeric"
                          value={val(i.productId, 'count')}
                          onChange={(e) => set(i.productId, 'count', e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (
                              await s.run(() =>
                                post('/admin/hub-stock/count', {
                                  productId: i.productId,
                                  counted: Number(val(i.productId, 'count')),
                                  reason: 'Stock count',
                                }),
                              )
                            ) {
                              set(i.productId, 'count', '');
                              await refresh();
                            }
                          }}
                        >
                          {t('record')}
                        </Button>
                      </span>
                    </td>
                    <td>
                      <span className="flex gap-1">
                        <input
                          aria-label={t('thresholdFor', { name: i.name })}
                          className={input}
                          inputMode="numeric"
                          placeholder={String(i.lowStockThreshold)}
                          value={val(i.productId, 'threshold')}
                          onChange={(e) => set(i.productId, 'threshold', e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (
                              await s.run(() =>
                                put('/admin/hub-stock/threshold', {
                                  productId: i.productId,
                                  lowStockThreshold: Number(val(i.productId, 'threshold')),
                                }),
                              )
                            ) {
                              set(i.productId, 'threshold', '');
                              await refresh();
                            }
                          }}
                        >
                          {t('set')}
                        </Button>
                      </span>
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="text-muted">
                    {t('dropShip')}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </AdminGate>
  );
}
