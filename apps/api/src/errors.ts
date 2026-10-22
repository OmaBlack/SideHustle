import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { PricingError } from '@sidehustle/pricing';
import type { Problem } from '@sidehustle/schemas';
import { ZodError } from 'zod';

/** An error with a stable code, rendered as RFC 7807 problem details. */
export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail?: string,
    /** Extra machine-readable fields merged into the problem body, e.g. `issues` or a fresh quote. */
    readonly extra?: Record<string, unknown>,
  ) {
    super(title);
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | HttpProblem, req, reply) => {
    let problem: Problem & Record<string, unknown>;
    if (err instanceof HttpProblem) {
      problem = {
        type: 'about:blank',
        status: err.status,
        code: err.code,
        title: err.title,
        detail: err.detail,
        ...err.extra,
      };
      const retryAfter = (err as { retryAfter?: number }).retryAfter;
      if (retryAfter) reply.header('retry-after', String(retryAfter));
    } else if (err instanceof PricingError) {
      problem = {
        type: 'about:blank',
        status: 400,
        code: err.code,
        title: 'That selection is not valid',
        detail: err.message,
      };
    } else if (err instanceof ZodError) {
      problem = {
        type: 'about:blank',
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'Some fields are not valid',
        detail: err.issues.map((i) => `${i.path.join('.') || '/'} ${i.message}`).join('; '),
        fields: Object.fromEntries(err.issues.map((i) => [i.path.join('.'), i.message])),
      };
    } else if (hasZodFastifySchemaValidationErrors(err)) {
      problem = {
        type: 'about:blank',
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'Some fields are not valid',
        detail: err.validation.map((v) => `${v.instancePath || '/'} ${v.message}`).join('; '),
        // Field → message, so forms can show inline errors (FR-ACC-02).
        fields: Object.fromEntries(
          err.validation.map((v) => [
            v.instancePath.replace(/^\//, '').replaceAll('/', '.'),
            v.message ?? 'Not valid',
          ]),
        ),
      };
    } else if (err.statusCode && err.statusCode < 500) {
      problem = {
        type: 'about:blank',
        status: err.statusCode,
        code: err.code ?? 'BAD_REQUEST',
        title: err.message,
      };
    } else {
      req.log.error({ err }, 'unhandled error');
      problem = { type: 'about:blank', status: 500, code: 'INTERNAL', title: 'Something went wrong' };
    }
    reply
      .status(problem.status)
      .type('application/problem+json')
      .send({ ...problem, instance: req.id });
  });

  app.setNotFoundHandler((req, reply) => {
    reply
      .status(404)
      .type('application/problem+json')
      .send({ type: 'about:blank', status: 404, code: 'NOT_FOUND', title: 'Not found', instance: req.id });
  });
}
