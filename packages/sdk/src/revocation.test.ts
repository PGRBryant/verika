import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  quit: vi.fn().mockResolvedValue('OK'),
};

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => mockRedis),
}));

vi.mock('pino', () => ({
  pino: vi.fn(() => ({
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { RevocationChecker } from './revocation.js';
import { pino } from 'pino';

const logger = pino();

describe('RevocationChecker', () => {
  let checker: RevocationChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    checker = new RevocationChecker('localhost', 6379, logger);
  });

  describe('check', () => {
    it('returns active for value 0', async () => {
      await checker.initialize();
      mockRedis.get.mockResolvedValueOnce('0');

      expect(await checker.check('tok_abc')).toBe('active');
    });

    it('returns revoked for value 1', async () => {
      await checker.initialize();
      mockRedis.get.mockResolvedValueOnce('1');

      expect(await checker.check('tok_abc')).toBe('revoked');
    });

    it('returns expired for null', async () => {
      await checker.initialize();
      mockRedis.get.mockResolvedValueOnce(null);

      expect(await checker.check('tok_abc')).toBe('expired');
    });

    it('returns unknown and increments failOpenCount on Redis error', async () => {
      await checker.initialize();
      mockRedis.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      expect(await checker.check('tok_abc')).toBe('unknown');
      expect(checker.stats.failOpenCount).toBe(1);
      expect(checker.stats.lastFailOpenAt).toBeGreaterThan(0);
    });

    it('returns unknown when Redis is null (never connected)', async () => {
      // Don't call initialize() — Redis stays null

      expect(await checker.check('tok_abc')).toBe('unknown');
      expect(checker.stats.failOpenCount).toBe(1);
    });

    it('accumulates failOpenCount across multiple failures', async () => {
      await checker.initialize();
      mockRedis.get
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('0');

      await checker.check('tok_1');
      await checker.check('tok_2');
      await checker.check('tok_3');

      expect(checker.stats.failOpenCount).toBe(2);
      expect(checker.stats.checkCount).toBe(3);
    });
  });

  describe('stats', () => {
    it('starts with zero counts', () => {
      expect(checker.stats).toEqual({
        failOpenCount: 0,
        checkCount: 0,
        lastFailOpenAt: null,
      });
    });

    it('tracks check count for successful checks', async () => {
      await checker.initialize();
      mockRedis.get.mockResolvedValue('0');

      await checker.check('tok_1');
      await checker.check('tok_2');

      expect(checker.stats.checkCount).toBe(2);
      expect(checker.stats.failOpenCount).toBe(0);
    });
  });
});
