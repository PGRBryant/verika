import { Redis } from 'ioredis';
import { pino, type Logger } from 'pino';
import type { VerikaApiConfig } from '../config.js';

// TODO(verika-v2): Dedicated Redis instance in verika-prod when revocation
// list exceeds 10k entries or when sharing room404 Redis creates operational
// coupling. Migration is a connection string change in SDK config.
// See docs/v2-dedicated-redis.md. Estimated effort: 2 days.

const REVOKED_PREFIX = 'verika:revoked:';
const SERVICE_TOKENS_PREFIX = 'verika:service-tokens:';

export type RevocationStatus = 'active' | 'revoked' | 'expired';

export class RevocationService {
  private readonly redis: Redis;
  private readonly logger: Logger;

  constructor(config: VerikaApiConfig) {
    this.logger = pino({ name: 'revocation-service' });
    this.redis = new Redis({
      host: config.redisHost,
      port: config.redisPort,
      keyPrefix: '',
      connectTimeout: 2000,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
    });

    this.redis.on('error', (err: Error) => {
      this.logger.error({ err }, 'Redis connection error');
    });
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  /** Called when a token is issued — marks it as active with TTL */
  async onTokenIssued(jti: string, serviceId: string, ttlSeconds: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.set(`${REVOKED_PREFIX}${jti}`, '0', 'EX', ttlSeconds);
    pipeline.sadd(`${SERVICE_TOKENS_PREFIX}${serviceId}`, jti);
    await pipeline.exec();
  }

  /** Revoke a specific token */
  async revokeToken(jti: string, remainingTtlSeconds: number): Promise<void> {
    await this.redis.set(`${REVOKED_PREFIX}${jti}`, '1', 'EX', remainingTtlSeconds);
    this.logger.info({ jti }, 'Token revoked');
  }

  /** Emergency: revoke all tokens for a service */
  async revokeAllServiceTokens(serviceId: string): Promise<number> {
    const jtis = await this.redis.smembers(`${SERVICE_TOKENS_PREFIX}${serviceId}`);
    if (jtis.length === 0) return 0;

    const pipeline = this.redis.pipeline();
    for (const jti of jtis) {
      // Set revoked with 60-minute TTL (covers longest-lived token: human tokens at 3600s)
      pipeline.set(`${REVOKED_PREFIX}${jti}`, '1', 'EX', 3600);
    }
    await pipeline.exec();

    this.logger.warn({ serviceId, count: jtis.length }, 'All service tokens revoked');
    return jtis.length;
  }

  /** Check if a token belongs to a specific service */
  async isTokenOwnedBy(jti: string, serviceId: string): Promise<boolean> {
    return (await this.redis.sismember(`${SERVICE_TOKENS_PREFIX}${serviceId}`, jti)) === 1;
  }

  /** Check token revocation status */
  async checkRevocation(jti: string): Promise<RevocationStatus> {
    const value = await this.redis.get(`${REVOKED_PREFIX}${jti}`);
    if (value === null) return 'expired';
    if (value === '0') return 'active';
    if (value === '1') return 'revoked';
    return 'expired';
  }

  async checkHealth(): Promise<{ status: 'ok' | 'unhealthy'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch {
      return { status: 'unhealthy', latencyMs: Date.now() - start };
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
