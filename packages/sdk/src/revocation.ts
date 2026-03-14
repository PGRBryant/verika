import { Redis as IORedis } from 'ioredis';
import { type Logger } from 'pino';

const REVOKED_PREFIX = 'verika:revoked:';

export type RevocationStatus = 'active' | 'revoked' | 'expired' | 'unknown';

export interface RevocationCheckerStats {
  failOpenCount: number;
  checkCount: number;
  lastFailOpenAt: number | null;
}

export class RevocationChecker {
  private redis: IORedis | null = null;
  private readonly redisHost: string;
  private readonly redisPort: number;
  private readonly logger: Logger;
  private _failOpenCount = 0;
  private _checkCount = 0;
  private _lastFailOpenAt: number | null = null;

  constructor(redisHost: string, redisPort: number, logger: Logger) {
    this.redisHost = redisHost;
    this.redisPort = redisPort;
    this.logger = logger.child({ component: 'revocation-checker' });
  }

  get stats(): RevocationCheckerStats {
    return {
      failOpenCount: this._failOpenCount,
      checkCount: this._checkCount,
      lastFailOpenAt: this._lastFailOpenAt,
    };
  }

  async initialize(): Promise<void> {
    const client = new IORedis({
      host: this.redisHost,
      port: this.redisPort,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
    });

    client.on('error', (err: Error) => {
      this.logger.error({ err }, 'Redis connection error');
    });

    try {
      await client.connect();
    } catch (err) {
      this.logger.warn({ err }, 'Redis connect failed — revocation checks will fail open');
    }

    this.redis = client;
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
    this._checkCount++;

    if (!this.redis) {
      this.recordFailOpen(jti, 'Redis unavailable');
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
      this.recordFailOpen(jti, 'Redis check failed', err);
      return 'unknown';
    }
  }

  private recordFailOpen(jti: string, reason: string, err?: unknown): void {
    this._failOpenCount++;
    this._lastFailOpenAt = Date.now();
    this.logger.warn(
      {
        jti,
        reason,
        err,
        failOpenCount: this._failOpenCount,
        failOpenRate: this._checkCount > 0
          ? `${((this._failOpenCount / this._checkCount) * 100).toFixed(1)}%`
          : 'N/A',
      },
      'Revocation check failed open',
    );
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
