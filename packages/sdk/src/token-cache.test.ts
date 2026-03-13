import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenCache } from './token-cache.js';

const createMockLogger = () => ({
  child: () => createMockLogger(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  level: 'info',
}) as any;

describe('TokenCache', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when getToken() called before initialize()', () => {
    const cache = new TokenCache(vi.fn(), logger);
    expect(() => cache.getToken()).toThrow('No token cached');
  });

  it('hasToken returns false before initialize', () => {
    const cache = new TokenCache(vi.fn(), logger);
    expect(cache.hasToken).toBe(false);
  });

  it('initialize() fetches and caches the token', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      token: 'test-jwt-123',
      expiresAt: Math.floor(Date.now() / 1000) + 900,
    });

    const cache = new TokenCache(fetcher, logger);
    await cache.initialize();

    expect(cache.getToken()).toBe('test-jwt-123');
    expect(cache.hasToken).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    cache.stop();
  });

  it('deduplicates concurrent refresh calls', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      token: 'deduped-token',
      expiresAt: Math.floor(Date.now() / 1000) + 900,
    });

    const cache = new TokenCache(fetcher, logger);

    // Call refresh concurrently
    const [r1, r2, r3] = await Promise.all([
      cache.refresh(),
      cache.refresh(),
      cache.refresh(),
    ]);

    expect(fetcher).toHaveBeenCalledOnce();
    cache.stop();
  });

  it('enters degraded mode after 5 consecutive failures', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network error'));

    const cache = new TokenCache(fetcher, logger);

    // First call fails
    await cache.initialize().catch(() => {});

    // Advance through backoff retries (1s, 2s, 4s, 8s)
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(Math.pow(2, i) * 1000 + 100);
    }

    expect(cache.degraded).toBe(true);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(5);
    cache.stop();
  });

  it('recovers from degraded mode on successful refresh', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 5) throw new Error('fail');
      return { token: 'recovered-token', expiresAt: Math.floor(Date.now() / 1000) + 900 };
    });

    const cache = new TokenCache(fetcher, logger);

    // Go through initial failures to degraded mode
    await cache.initialize().catch(() => {});
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(Math.pow(2, i) * 1000 + 100);
    }
    expect(cache.degraded).toBe(true);

    // Advance past degraded retry interval (30s)
    await vi.advanceTimersByTimeAsync(31_000);

    expect(cache.degraded).toBe(false);
    expect(cache.getToken()).toBe('recovered-token');
    cache.stop();
  });

  it('stop() clears all timers', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      token: 'token',
      expiresAt: Math.floor(Date.now() / 1000) + 900,
    });

    const cache = new TokenCache(fetcher, logger);
    await cache.initialize();
    cache.stop();

    // Advance time past refresh window — fetcher should not be called again
    await vi.advanceTimersByTimeAsync(900_000);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
