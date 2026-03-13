import { describe, it, expect, vi } from 'vitest';
import { createWsReauthHandler } from './ws-reauth.js';
import type { VerikaWsMessage } from '@internal/verika-shared';

describe('createWsReauthHandler', () => {
  it('responds to REAUTH_REQUIRED with REAUTH containing fresh token', async () => {
    const handler = createWsReauthHandler({
      onReauthRequired: async () => 'fresh-token-123',
    });

    const msg: VerikaWsMessage = {
      type: 'REAUTH_REQUIRED',
      deadline: Date.now() + 30_000,
    };

    const response = await handler(msg);
    expect(response).toEqual({ type: 'REAUTH', token: 'fresh-token-123' });
  });

  it('returns null on REAUTH_ACK', async () => {
    const handler = createWsReauthHandler({
      onReauthRequired: async () => 'token',
    });

    const response = await handler({ type: 'REAUTH_ACK' });
    expect(response).toBeNull();
  });

  it('returns null for unrelated messages', async () => {
    const handler = createWsReauthHandler({
      onReauthRequired: async () => 'token',
    });

    // REAUTH is a client→server message, handler should ignore it
    const response = await handler({ type: 'REAUTH', token: 'x' });
    expect(response).toBeNull();
  });

  it('calls onReauthFailed when token fetch fails', async () => {
    const onFailed = vi.fn();
    const handler = createWsReauthHandler({
      onReauthRequired: async () => { throw new Error('refresh failed'); },
      onReauthFailed: onFailed,
    });

    const response = await handler({
      type: 'REAUTH_REQUIRED',
      deadline: Date.now() + 30_000,
    });

    expect(response).toBeNull();
    expect(onFailed).toHaveBeenCalledWith(expect.any(Error));
    expect(onFailed.mock.calls[0][0].message).toBe('refresh failed');
  });

  it('wraps non-Error throws in Error', async () => {
    const onFailed = vi.fn();
    const handler = createWsReauthHandler({
      onReauthRequired: async () => { throw 'string-error'; },
      onReauthFailed: onFailed,
    });

    await handler({ type: 'REAUTH_REQUIRED', deadline: Date.now() + 30_000 });

    expect(onFailed).toHaveBeenCalledWith(expect.any(Error));
    expect(onFailed.mock.calls[0][0].message).toBe('string-error');
  });
});
