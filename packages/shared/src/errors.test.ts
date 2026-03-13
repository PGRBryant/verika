import { describe, it, expect } from 'vitest';
import { VerikaError } from './errors.js';

describe('VerikaError', () => {
  it('sets code and message', () => {
    const err = new VerikaError('VERIKA_TOKEN_EXPIRED', 'token has expired');
    expect(err.code).toBe('VERIKA_TOKEN_EXPIRED');
    expect(err.message).toBe('token has expired');
    expect(err.name).toBe('VerikaError');
  });

  it('is an instance of Error', () => {
    const err = new VerikaError('VERIKA_UNREACHABLE', 'cannot reach');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VerikaError);
  });

  it('has a stack trace', () => {
    const err = new VerikaError('VERIKA_SERVICE_NOT_FOUND', 'not found');
    expect(err.stack).toBeDefined();
  });

  it('code is readonly', () => {
    const err = new VerikaError('VERIKA_TOKEN_REVOKED', 'revoked');
    expect(err.code).toBe('VERIKA_TOKEN_REVOKED');
  });
});
