import * as jose from 'jose';
import { pino, type Logger } from 'pino';
import type {
  VerikaClientOptions,
  ValidatedServiceIdentity,
  ValidatedHumanIdentity,
  ServiceRegistration,
  VerikaWsMessage,
} from '@internal/verika-shared';
import { VerikaError } from '@internal/verika-shared';
import { TokenCache } from './token-cache.js';
import { JWKSCache } from './jwks-cache.js';
import { RevocationChecker } from './revocation.js';
import { RevocationMonitor } from './revocation-monitor.js';
import { isInShutdown } from './graceful-shutdown.js';
import { createWsReauthHandler } from './ws-reauth.js';

// TODO(verika-v2): Replace with verika.createHttpClient() for mTLS client
// certificates on all outbound connections. Certificate TTL: 24 hours,
// rotated by SDK 1 hour before expiry. Issued by Verika CA (Certificate
// Authority Service). Triggers when service count exceeds 6 or security
// review identifies transport-layer verification as a priority.
// verika.createHttpClient() interface defined here — no-op in V1.
// See docs/v2-mtls.md. Estimated effort: 2-3 weeks.

export class VerikaClient {
  private readonly options: VerikaClientOptions;
  private readonly tokenCache: TokenCache;
  private readonly jwksCache: JWKSCache;
  private readonly revocationChecker: RevocationChecker;
  private readonly revocationMonitor: RevocationMonitor;
  private readonly logger: Logger;
  private initialized = false;

  constructor(options: VerikaClientOptions) {
    this.options = options;
    this.logger = pino({ name: `verika-sdk:${options.service}` });

    this.tokenCache = new TokenCache(
      () => this.fetchServiceToken(),
      this.logger,
    );

    this.jwksCache = new JWKSCache(options.verikaEndpoint, this.logger);

    const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
    const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
    this.revocationChecker = new RevocationChecker(redisHost, redisPort, this.logger);

    this.revocationMonitor = new RevocationMonitor(
      options.service,
      options.verikaEndpoint,
      this.logger,
      options.continuousAuth?.revocationCheckInterval,
    );
  }

  // ─── Outbound ──────────────────────────────────────────────────────────────

  /**
   * Returns the current cached service token for the default target.
   * Synchronous — the token is pre-fetched and refreshed in the background.
   */
  serviceToken(): string {
    if (!this.initialized) {
      throw new VerikaError('VERIKA_UNREACHABLE', 'VerikaClient not initialized — call ready() first');
    }
    if (isInShutdown()) {
      throw new VerikaError('VERIKA_SERVICE_REVOKED', 'Service is shutting down');
    }
    return this.tokenCache.getToken();
  }

  /**
   * Fetch a service token scoped to a specific target service.
   * Not cached — use for on-demand cross-service calls when the target varies.
   */
  async serviceTokenFor(targetService: string): Promise<string> {
    if (!this.initialized) {
      throw new VerikaError('VERIKA_UNREACHABLE', 'VerikaClient not initialized — call ready() first');
    }
    if (isInShutdown()) {
      throw new VerikaError('VERIKA_SERVICE_REVOKED', 'Service is shutting down');
    }
    const { token } = await this.fetchServiceToken(targetService);
    return token;
  }

  /** Look up a service in the Verika registry. */
  async findService(serviceId: string): Promise<ServiceRegistration> {
    const response = await fetch(
      `${this.options.verikaEndpoint}/v1/services/${serviceId}`,
      { headers: { Authorization: `Bearer ${this.serviceToken()}` } },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new VerikaError('VERIKA_SERVICE_NOT_FOUND', `Service ${serviceId} not found`);
      }
      throw new VerikaError('VERIKA_UNREACHABLE', `Registry lookup failed: ${response.status}`);
    }

    return (await response.json()) as ServiceRegistration;
  }

  /** Get the URL for a registered service. */
  async serviceUrl(
    serviceId: string,
    env: 'production' | 'internal' | 'staging' = 'production',
  ): Promise<string> {
    const service = await this.findService(serviceId);
    const url = service.endpoints[env];
    if (!url) {
      throw new VerikaError(
        'VERIKA_SERVICE_NOT_FOUND',
        `No ${env} endpoint for ${serviceId}`,
      );
    }
    return url;
  }

  // ─── Inbound Validation ────────────────────────────────────────────────────

  /** Validate a Verika service token. Local signature verification + Redis revocation check. */
  async validateServiceToken(
    token: string,
    options?: { allowedServices?: string[] },
  ): Promise<ValidatedServiceIdentity> {
    const keySet = this.jwksCache.getLocalJWKSet();

    let payload: jose.JWTPayload;
    try {
      const result = await jose.jwtVerify(token, keySet, {
        issuer: 'verika',
        audience: this.options.service,
      });
      payload = result.payload;
    } catch (err) {
      if (err instanceof jose.errors.JWTExpired) {
        throw new VerikaError('VERIKA_TOKEN_EXPIRED', 'Service token expired');
      }
      throw new VerikaError('VERIKA_TOKEN_INVALID_SIGNATURE', 'Invalid token signature');
    }

    // Check revocation
    const jti = payload['jti'] as string;
    if (jti) {
      const status = await this.revocationChecker.check(jti);
      if (status === 'revoked') {
        throw new VerikaError('VERIKA_TOKEN_REVOKED', `Token ${jti} has been revoked`);
      }
      if (status === 'expired') {
        throw new VerikaError('VERIKA_TOKEN_EXPIRED', `Token ${jti} has expired`);
      }
      if (status === 'unknown' && this.options.revocationFailMode === 'closed') {
        throw new VerikaError(
          'VERIKA_REVOCATION_UNAVAILABLE',
          `Revocation check unavailable for ${jti} and service is configured to fail closed`,
        );
      }
    }

    const serviceId = payload['sub'] as string;

    // Check allowed services
    if (options?.allowedServices && !options.allowedServices.includes(serviceId)) {
      throw new VerikaError(
        'VERIKA_CALLER_NOT_ALLOWED',
        `Service ${serviceId} is not in allowed callers`,
      );
    }

    return {
      serviceId,
      version: payload['ver'] as string,
      project: payload['proj'] as string,
      capabilities: (payload['caps'] as string[]) ?? [],
      tokenId: jti ?? '',
      issuedAt: payload['iat'] as number,
      expiresAt: payload['exp'] as number,
    };
  }

  /** Validate a Verika human token. Verifies signature, audience, revocation status, and roles. */
  async validateHumanToken(
    token: string,
    options?: { requiredRole?: string },
  ): Promise<ValidatedHumanIdentity> {
    const keySet = this.jwksCache.getLocalJWKSet();

    let payload: jose.JWTPayload;
    try {
      const result = await jose.jwtVerify(token, keySet, {
        issuer: 'verika',
        audience: this.options.service,
      });
      payload = result.payload;
    } catch (err) {
      if (err instanceof jose.errors.JWTExpired) {
        throw new VerikaError('VERIKA_TOKEN_EXPIRED', 'Human token expired');
      }
      throw new VerikaError('VERIKA_TOKEN_INVALID_SIGNATURE', 'Invalid token signature');
    }

    // Check revocation (same path as service tokens)
    const jti = payload['jti'] as string;
    if (jti) {
      const status = await this.revocationChecker.check(jti);
      if (status === 'revoked') {
        throw new VerikaError('VERIKA_TOKEN_REVOKED', `Human token ${jti} has been revoked`);
      }
      if (status === 'expired') {
        throw new VerikaError('VERIKA_TOKEN_EXPIRED', `Human token ${jti} has expired`);
      }
      if (status === 'unknown' && this.options.revocationFailMode === 'closed') {
        throw new VerikaError(
          'VERIKA_REVOCATION_UNAVAILABLE',
          `Revocation check unavailable for ${jti} and service is configured to fail closed`,
        );
      }
    }

    const roles = (payload['roles'] as string[]) ?? [];

    if (options?.requiredRole && !roles.includes(options.requiredRole)) {
      throw new VerikaError(
        'VERIKA_CAPABILITY_MISSING',
        `Required role ${options.requiredRole} not found`,
      );
    }

    return {
      userId: payload['sub'] as string,
      email: payload['email'] as string,
      roles,
      tokenId: jti ?? '',
      issuedAt: payload['iat'] as number,
      expiresAt: payload['exp'] as number,
    };
  }

  /** Check if a token has a specific capability. */
  async can(token: string, capability: string): Promise<boolean> {
    try {
      const identity = await this.validateServiceToken(token);
      return identity.capabilities.includes(capability);
    } catch {
      return false;
    }
  }

  // ─── Human Auth ────────────────────────────────────────────────────────────

  /** Exchange a Google OAuth token for a Verika human token scoped to this service. */
  async exchangeGoogleToken(googleToken: string): Promise<string> {
    const response = await fetch(
      `${this.options.verikaEndpoint}/v1/tokens/human`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleToken, targetService: this.options.service }),
      },
    );

    if (!response.ok) {
      throw new VerikaError('VERIKA_EXCHANGE_FAILED', `Token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as { token: string };
    return data.token;
  }

  // ─── Emergency ─────────────────────────────────────────────────────────────

  /** Revoke all tokens for this service. Emergency use. */
  async revokeAllMyTokens(): Promise<{ revokedCount: number }> {
    const response = await fetch(
      `${this.options.verikaEndpoint}/v1/tokens/revoke`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ revokeAll: true }),
      },
    );

    if (!response.ok) {
      throw new VerikaError('VERIKA_UNREACHABLE', `Revocation failed: ${response.status}`);
    }

    return (await response.json()) as { revokedCount: number };
  }

  // ─── WebSocket ─────────────────────────────────────────────────────────────

  /** Create a client-side WS re-authentication handler. */
  createWsReauthHandler(
    options: { onReauthRequired: () => Promise<string> },
  ): (message: VerikaWsMessage) => Promise<VerikaWsMessage | null> {
    return createWsReauthHandler(options);
  }

  // ─── Observability ─────────────────────────────────────────────────────────

  /** Revocation check stats — wire into your metrics exporter. */
  get revocationStats() {
    return this.revocationChecker.stats;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Initialize the client. Must complete before serving traffic. */
  async ready(): Promise<void> {
    this.logger.info({ service: this.options.service }, 'Initializing Verika client');

    await this.revocationChecker.initialize();
    await this.jwksCache.initialize();
    await this.tokenCache.initialize();

    this.revocationMonitor.start(() => this.tokenCache.getToken());

    this.initialized = true;
    this.logger.info({ service: this.options.service }, 'Verika client ready');
  }

  /** Stop all background processes and clean up. */
  async close(): Promise<void> {
    this.revocationMonitor.stop();
    this.tokenCache.stop();
    this.jwksCache.stop();
    await this.revocationChecker.close();
    this.initialized = false;
    this.logger.info('Verika client closed');
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * Fetches a GCP identity token from the metadata server.
   * The audience is set to the Verika API endpoint so the token is scoped.
   */
  private async fetchGcpIdentityToken(): Promise<string> {
    const audience = this.options.verikaEndpoint;
    const metadataUrl =
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;

    const response = await fetch(metadataUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
    });

    if (!response.ok) {
      throw new VerikaError(
        'VERIKA_UNREACHABLE',
        `Failed to fetch GCP identity token: ${response.status}. ` +
          'Ensure this service is running on GCP with a service account.',
      );
    }

    return response.text();
  }

  private async fetchServiceToken(
    targetService?: string,
  ): Promise<{ token: string; expiresAt: number }> {
    const gcpToken = await this.fetchGcpIdentityToken();

    const response = await fetch(
      `${this.options.verikaEndpoint}/v1/tokens/service`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gcpToken}`,
        },
        body: JSON.stringify({
          serviceId: this.options.service,
          targetService: targetService ?? this.options.targetService,
        }),
      },
    );

    if (!response.ok) {
      throw new VerikaError('VERIKA_UNREACHABLE', `Token fetch failed: ${response.status}`);
    }

    return (await response.json()) as { token: string; expiresAt: number };
  }
}
