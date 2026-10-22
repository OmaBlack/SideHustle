import { describe, expect, it } from 'vitest';
import { assertResettable } from '../src/reset.js';

const REMOTE = 'postgres://u:p@staging.example.com:5432/sidehustle';

describe('assertResettable', () => {
  it('allows local dev', () => {
    expect(() => assertResettable('postgres://u:p@localhost:5432/sidehustle', {})).not.toThrow();
  });
  it('allows loopback v4', () => {
    expect(() => assertResettable('postgres://u:p@127.0.0.1/app', {})).not.toThrow();
  });
  it('allows loopback v6', () => {
    expect(() => assertResettable('postgres://u:p@[::1]:5432/app', {})).not.toThrow();
  });
  it('allows a remote *_test database', () => {
    expect(() => assertResettable('postgres://u:p@db.internal:5432/sidehustle_test', {})).not.toThrow();
  });
  it('refuses a remote non-test database', () => {
    expect(() => assertResettable(REMOTE, {})).toThrow(/Refusing to reset staging\.example\.com\/sidehustle/);
  });
  it('honours ALLOW_DB_RESET=1', () => {
    expect(() => assertResettable(REMOTE, { ALLOW_DB_RESET: '1' })).not.toThrow();
  });
  it('refuses production even with the override', () => {
    expect(() =>
      assertResettable('postgres://u:p@localhost:5432/sidehustle', {
        NODE_ENV: 'production',
        ALLOW_DB_RESET: '1',
      }),
    ).toThrow(/production/);
  });
  it('rejects an invalid URL', () => {
    expect(() => assertResettable('not a url', {})).toThrow(/not a valid/);
  });
  it('does not leak credentials in the message', () => {
    let message = '';
    try {
      assertResettable(REMOTE, {});
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain(':p@');
  });
});
