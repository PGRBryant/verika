import pino from 'pino';

const REFRESH_BEFORE_EXPIRY_MS = 3 * 60 * 1000; // 3 minutes before TTL
const MAX_BACKOFF_RETRIES = 5;
const DEGRADED_RETRY_INTERVAL_MS = 30_000;

interface TokenResponse {
  token: string;
  expiresAt: number;
}

type TokenFetcher = () => Promise<TokenResponse>;

export class TokenCache {
  private currentToken: string | null = null;
  private expiresAt = 0;
  private refreshPromise: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private degradedTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private isDegraded = false;
  private readonly logger: pino.Logger;
  private readonly fetchToken: TokenFetcher;

  constructor(fetchToken: TokenFetcher, logger: pino.Logger) {
    this.fetchToken = fetchToken;
    this.logger = logger.child({ component: 'token-cache' });
  }

  /** Returns the current cached token. Throws if none available. */
  getToken(): string {
    if (!this.currentToken) {
      throw new Error('No token cached — call initialize() first');
    }
    return this.currentToken;
  }

  get hasToken(): boolean {
    return this.currentToken !== null;
  }

  get degraded(): boolean {
    return this.isDegraded;
  }

  /** Fetch the initial token and start the refresh cycle. */
  async initialize(): Promise<void> {
    await this.refresh();
  }

  /** Proactive refresh — called at TTL - 3 minutes. */
  async refresh(): Promise<void> {
    // Deduplicate concurrent refresh calls — return the in-flight promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  stop(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.degradedTimer) {
      clearInterval(this.degradedTimer);
      this.degradedTimer = null;
    }
  }

  private async doRefresh(): Promise<void> {
    try {
      const { token, expiresAt } = await this.fetchToken();
      this.currentToken = token;
      this.expiresAt = expiresAt;
      this.consecutiveFailures = 0;

      if (this.isDegraded) {
        this.logger.info('Recovered from degraded mode');
        this.isDegraded = false;
        if (this.degradedTimer) {
          clearInterval(this.degradedTimer);
          this.degradedTimer = null;
        }
      }

      this.scheduleRefresh();
    } catch (err) {
      this.consecutiveFailures++;
      this.logger.error(
        { err, failures: this.consecutiveFailures },
        'Token refresh failed',
      );

      if (this.consecutiveFailures >= MAX_BACKOFF_RETRIES) {
        this.enterDegradedMode();
        return;
      }

      // Exponential backoff: 1s → 2s → 4s → 8s → 16s
      const backoffMs = Math.pow(2, this.consecutiveFailures - 1) * 1000;
      this.refreshTimer = setTimeout(() => void this.refresh(), backoffMs);
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const ttlMs = (this.expiresAt * 1000) - Date.now();
    const refreshInMs = Math.max(ttlMs - REFRESH_BEFORE_EXPIRY_MS, 0);

    this.logger.debug({ refreshInMs }, 'Scheduled token refresh');
    this.refreshTimer = setTimeout(() => void this.refresh(), refreshInMs);
  }

  private enterDegradedMode(): void {
    this.isDegraded = true;
    this.logger.error(
      'Entering degraded mode — serving existing in-flight requests, refusing new inbound calls. Retrying every 30s.',
    );

    // Retry every 30 seconds in degraded mode
    this.degradedTimer = setInterval(() => void this.refresh(), DEGRADED_RETRY_INTERVAL_MS);
  }
}
