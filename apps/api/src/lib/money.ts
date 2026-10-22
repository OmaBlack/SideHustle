const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});
export const formatNaira = (kobo: number) => naira.format(Math.round(kobo / 100));
