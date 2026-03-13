import * as jose from 'jose';
import { type Logger } from 'pino';

const JWKS_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class JWKSCache {
  private keySet: jose.JSONWebKeySet | null = null;
  private previousKeySet: jose.JSONWebKeySet | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly verikaEndpoint: string;
  private readonly logger: Logger;

  constructor(verikaEndpoint: string, logger: Logger) {
    this.verikaEndpoint = verikaEndpoint;
    this.logger = logger.child({ component: 'jwks-cache' });
  }

  /** Fetch JWKS and start periodic refresh. */
  async initialize(): Promise<void> {
    await this.fetchJwks();
    this.refreshTimer = setInterval(() => void this.fetchJwks(), JWKS_REFRESH_INTERVAL_MS);
  }

  /** Get the current JWKS for local token verification. */
  getKeySet(): jose.JSONWebKeySet {
    if (!this.keySet) {
      throw new Error('JWKS not initialized — call initialize() first');
    }
    return this.keySet;
  }

  /**
   * Create a local JWK set function for jose.jwtVerify.
   * Includes both current and previous keys during rotation overlap.
   */
  getLocalJWKSet(): ReturnType<typeof jose.createLocalJWKSet> {
    const keys = [...(this.keySet?.keys ?? [])];

    // Retain old keys during rotation overlap window
    if (this.previousKeySet) {
      for (const oldKey of this.previousKeySet.keys) {
        const alreadyPresent = keys.some((k) => k.kid === oldKey.kid);
        if (!alreadyPresent) {
          keys.push(oldKey);
        }
      }
    }

    return jose.createLocalJWKSet({ keys });
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async fetchJwks(): Promise<void> {
    try {
      const response = await fetch(`${this.verikaEndpoint}/v1/jwks`);
      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status}`);
      }

      const jwks = (await response.json()) as jose.JSONWebKeySet;

      // Keep previous key set for rotation overlap
      if (this.keySet) {
        this.previousKeySet = this.keySet;
      }

      this.keySet = jwks;
      this.logger.debug({ keyCount: jwks.keys.length }, 'JWKS refreshed');
    } catch (err) {
      this.logger.error({ err }, 'Failed to refresh JWKS');
      // Keep using existing keys on failure
    }
  }
}
