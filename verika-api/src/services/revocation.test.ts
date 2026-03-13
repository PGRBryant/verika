import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis before importing the module
const mockPipeline = {
  set: vi.fn().mockReturnThis(),
  sadd: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
};

const mockRedis = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  smembers: vi.fn().mockResolvedValue([]),
  pipeline: vi.fn().mockReturnValue(mockPipeline),
  ping: vi.fn().mockResolvedValue('PONG'),
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
    debug: vi.fn(),
  })),
}));

import { RevocationService } from './revocation.js';

const mockConfig = {
  port: 8080,
  environment: 'test',
  kmsKeyName: 'projects/test/locations/us/keyRings/test/cryptoKeys/test/cryptoKeyVersions/1',
  redisHost: 'localhost',
  redisPort: 6379,
  gcpProjectId: 'test-project',
} as any;

describe('RevocationService', () => {
  let service: RevocationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RevocationService(mockConfig);
  });

  describe('onTokenIssued', () => {
    it('sets revoked key to 0 and adds to service set', async () => {
      await service.onTokenIssued('jti-123', 'mystweaver-api', 900);

      expect(mockPipeline.set).toHaveBeenCalledWith('verika:revoked:jti-123', '0', 'EX', 900);
      expect(mockPipeline.sadd).toHaveBeenCalledWith('verika:service-tokens:mystweaver-api', 'jti-123');
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('revokeToken', () => {
    it('sets revoked key to 1 with remaining TTL', async () => {
      await service.revokeToken('jti-456', 600);

      expect(mockRedis.set).toHaveBeenCalledWith('verika:revoked:jti-456', '1', 'EX', 600);
    });
  });

  describe('revokeAllServiceTokens', () => {
    it('returns 0 when no tokens exist', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);

      const count = await service.revokeAllServiceTokens('empty-service');
      expect(count).toBe(0);
    });

    it('revokes all tokens with 15-minute TTL', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['jti-1', 'jti-2', 'jti-3']);

      const count = await service.revokeAllServiceTokens('mystweaver-api');

      expect(count).toBe(3);
      expect(mockPipeline.set).toHaveBeenCalledTimes(3);
      expect(mockPipeline.set).toHaveBeenCalledWith('verika:revoked:jti-1', '1', 'EX', 900);
      expect(mockPipeline.set).toHaveBeenCalledWith('verika:revoked:jti-2', '1', 'EX', 900);
      expect(mockPipeline.set).toHaveBeenCalledWith('verika:revoked:jti-3', '1', 'EX', 900);
    });
  });

  describe('checkRevocation', () => {
    it('returns active for value 0', async () => {
      mockRedis.get.mockResolvedValueOnce('0');
      expect(await service.checkRevocation('jti-active')).toBe('active');
    });

    it('returns revoked for value 1', async () => {
      mockRedis.get.mockResolvedValueOnce('1');
      expect(await service.checkRevocation('jti-revoked')).toBe('revoked');
    });

    it('returns expired for null (key expired)', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      expect(await service.checkRevocation('jti-expired')).toBe('expired');
    });

    it('returns expired for unexpected value', async () => {
      mockRedis.get.mockResolvedValueOnce('unexpected');
      expect(await service.checkRevocation('jti-unknown')).toBe('expired');
    });
  });

  describe('checkHealth', () => {
    it('returns ok with latency on successful ping', async () => {
      mockRedis.ping.mockResolvedValueOnce('PONG');
      const health = await service.checkHealth();
      expect(health.status).toBe('ok');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy on ping failure', async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error('connection lost'));
      const health = await service.checkHealth();
      expect(health.status).toBe('unhealthy');
    });
  });

  describe('close', () => {
    it('calls redis quit', async () => {
      await service.close();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});
