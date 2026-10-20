import { getRequestConfig } from 'next-intl/server';

/** en-NG only at launch (NFR-USE-03). Adding a locale is a new messages file plus locale routing. */
export const LOCALE = 'en-NG';

export default getRequestConfig(async () => ({
  locale: LOCALE,
  messages: (await import(`../../messages/${LOCALE}.json`)).default,
  timeZone: 'Africa/Lagos',
}));
