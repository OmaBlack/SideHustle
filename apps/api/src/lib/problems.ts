import { HttpProblem } from '../errors.js';

export const unauthorized = () => new HttpProblem(401, 'UNAUTHENTICATED', 'Please log in to continue');
export const forbidden = (detail?: string) => new HttpProblem(403, 'FORBIDDEN', 'You cannot do that', detail);
export const notFound = (what = 'Not found') => new HttpProblem(404, 'NOT_FOUND', what);
export const conflict = (code: string, title: string, detail?: string) =>
  new HttpProblem(409, code, title, detail);
export const badRequest = (code: string, title: string, detail?: string) =>
  new HttpProblem(400, code, title, detail);
