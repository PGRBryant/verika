import Redis from 'ioredis';
import pino from 'pino';

// TODO(verika-v2): Fail closed when service handles operations sensitive
// enough to trade availability for security. Not warranted in V1.
// See docs/v2-dedicated-redis.md. Estimated effort: N/A (config change).

const REVOKED_PREFIX = 'verika:revoked:';

export type RevocationStatus = 'active' | 'revoked' | 'expired' | 'unknown';

export class RevocationChecker {
  private redis: Redis | null = null;
  private readonly redisHost: string;
  private readonly redisPort: number;
  private readonly logger: pino.Logger;

  constructor(redisHost: string, redisPort: number, logger: pino.Logger) {
    this.redisHost = redisHost;
    this.redisPort = redisPort;
    this.logger = logger.child({ component: 'revocation-checker' });
  }

  async initialize(): Promise<void> {
    this.redis = new Redis({
      host: this.redisHost,
      port: this.redisPort,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error({ err }, 'Redis connection error');
    });

    try {
      await this.redis.connect();
    } catch (err) {
      this.logger.warn({ err }, 'Redis connect failed — revocation checks will fail open');
    }
  }

  /**
   * Check token revocation status.
   *   null → expired, reject
   *   "0"  → active, proceed
   *   "1"  → revoked, reject + alert
   *
   * On Redis unavailable: fail open with warning log.
   */
  async check(jti: string): Promise<RevocationStatus> {
    if (!this.redis) {
      this.logger.warn({ jti }, 'Redis unavailable — failing open');
      return 'unknown';
    }

    try {
      const value = await this.redis.get(`${REVOKED_PREFIX}${jti}`);

      if (value === null) return 'expired';
      if (value === '0') return 'active';
      if (value === '1') {
        this.logger.warn({ jti }, 'Revoked token presented');
        return 'revoked';
      }

      return 'expired';
    } catch (err) {
      // Fail open with warning — V1 trades security for availability here
      this.logger.warn({ err, jti }, 'Redis check failed — failing open');
      return 'unknown';
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
