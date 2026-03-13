import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to reset module state between tests
let isInShutdown: () => boolean;
let initiateGracefulShutdown: (logger: any) => Promise<void>;

const createMockLogger = () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}) as any;

describe('graceful-shutdown', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Reset the module to clear `isShuttingDown` state
    vi.resetModules();
    const mod = await import('./graceful-shutdown.js');
    isInShutdown = mod.isInShutdown;
    initiateGracefulShutdown = mod.initiateGracefulShutdown;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isInShutdown returns false initially', () => {
    expect(isInShutdown()).toBe(false);
  });

  it('isInShutdown returns true after shutdown initiated', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const logger = createMockLogger();

    // Start shutdown (don't await — it waits 30s then exits)
    const shutdownPromise = initiateGracefulShutdown(logger);

    expect(isInShutdown()).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Initiating graceful shutdown'),
    );

    // Advance past drain timeout
    await vi.advanceTimersByTimeAsync(30_000);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('second call is a no-op', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const logger = createMockLogger();

    // Initiate twice
    initiateGracefulShutdown(logger);
    initiateGracefulShutdown(logger);

    // logger.error should only be called once (not twice)
    expect(logger.error).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    exitSpy.mockRestore();
  });
});
