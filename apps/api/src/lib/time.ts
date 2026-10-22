export const minutesFromNow = (m: number, now = new Date()) => new Date(now.getTime() + m * 60_000);
export const daysFromNow = (d: number, now = new Date()) => new Date(now.getTime() + d * 86_400_000);
