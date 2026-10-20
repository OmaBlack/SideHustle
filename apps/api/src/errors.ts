import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { Problem } from '@sidehustle/schemas';

/** An error with a stable code, rendered as RFC 7807 problem details. */
export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(title);
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | HttpProblem, req, reply) => {
    let problem: Problem;
    if (err instanceof HttpProblem) {
      problem = {
        type: 'about:blank',
        status: err.status,
        code: err.code,
        title: err.title,
        detail: err.detail,
      };
    } else if (hasZodFastifySchemaValidationErrors(err)) {
      problem = {
        type: 'about:blank',
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'Some fields are not valid',
        detail: err.validation.map((v) => `${v.instancePath || '/'} ${v.message}`).join('; '),
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
