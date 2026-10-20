/** The pilot runs in Lagos; "today" for deal end dates is the Africa/Lagos calendar date. */
export const BUSINESS_TIME_ZONE = 'Africa/Lagos';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** ISO calendar date (YYYY-MM-DD) in Africa/Lagos for the given instant. */
export function lagosDate(now: Date): string {
  return fmt.format(now);
}
