import type { FastifyInstance } from 'fastify';
import * as crypto from 'node:crypto';
import type { RegistryService } from '../services/registry.js';
import type { TokenSignerService } from '../services/token-signer.js';
import type { RevocationService } from '../services/revocation.js';
import type { PolicyService } from '../services/policy.js';
import type { GcpAuthService, GcpIdentity } from '../services/gcp-auth.js';
import type { VerikaApiConfig } from '../config.js';
import { requireGcpAuth, requireVerikaAuth } from '../middleware/auth.js';

interface TokenServices {
  registry: RegistryService;
  tokenSigner: TokenSignerService;
  revocation: RevocationService;
  policy: PolicyService;
  gcpAuth: GcpAuthService;
  config: VerikaApiConfig;
}

const TOKEN_TTL_SECONDS = 900;

// --- JSON Schemas for request validation ---

const serviceTokenSchema = {
  body: {
    type: 'object' as const,
    required: ['serviceId', 'targetService'],
    properties: {
      serviceId: { type: 'string' as const, minLength: 1, maxLength: 128, pattern: '^[a-z0-9-]+$' },
      targetService: { type: 'string' as const, minLength: 1, maxLength: 128, pattern: '^[a-z0-9-]+$' },
    },
    additionalProperties: false,
  },
};

const humanTokenSchema = {
  body: {
    type: 'object' as const,
    required: ['googleToken', 'targetService'],
    properties: {
      googleToken: { type: 'string' as const, minLength: 1, maxLength: 4096 },
      targetService: { type: 'string' as const, minLength: 1, maxLength: 128, pattern: '^[a-z0-9-]+$' },
    },
    additionalProperties: false,
  },
};

// Simple in-memory rate limiter for human token endpoint
const HUMAN_TOKEN_RATE_WINDOW_MS = 60_000; // 1 minute
const HUMAN_TOKEN_RATE_MAX = 10; // max requests per email per window
const humanTokenRateMap = new Map<string, { count: number; resetAt: number }>();

function checkHumanTokenRate(email: string): boolean {
  const now = Date.now();
  const entry = humanTokenRateMap.get(email);

  if (!entry || now >= entry.resetAt) {
    humanTokenRateMap.set(email, { count: 1, resetAt: now + HUMAN_TOKEN_RATE_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= HUMAN_TOKEN_RATE_MAX;
}

const revokeTokenSchema = {
  body: {
    type: 'object' as const,
    properties: {
      jti: { type: 'string' as const, minLength: 1, maxLength: 128, pattern: '^tok_' },
      revokeAll: { type: 'boolean' as const },
    },
    additionalProperties: false,
  },
};

export function registerTokenRoutes(
  app: FastifyInstance,
  services: TokenServices,
): void {
  /**
   * POST /v1/tokens/service
   * Issue a service token.
   * Auth: GCP Workload Identity (bootstrap — not a Verika token)
   */
  app.post<{ Body: { serviceId: string; targetService: string } }>(
    '/v1/tokens/service',
    {
      schema: serviceTokenSchema,
      preHandler: [requireGcpAuth({ gcpAuth: services.gcpAuth, tokenSigner: services.tokenSigner })],
    },
    async (req, reply) => {
      const { serviceId, targetService } = req.body;
      const gcpIdentity = (req as typeof req & { gcpIdentity: GcpIdentity }).gcpIdentity;

      // Step 1: Validate GCP identity matches claimed serviceId
      if (gcpIdentity.serviceId !== serviceId) {
        return reply.code(403).send({
          error: `GCP identity ${gcpIdentity.serviceId} cannot claim service ${serviceId}`,
        });
      }

      // Step 2: Check service registered and active
      const registration = await services.registry.getService(serviceId);
      if (!registration) {
        return reply.code(404).send({ error: `Service ${serviceId} not registered` });
      }
      if (registration.status !== 'active') {
        return reply.code(403).send({
          error: `Service ${serviceId} is ${registration.status}`,
        });
      }

      // Step 3: Verify target service exists
      const targetRegistration = await services.registry.getService(targetService);
      if (!targetRegistration) {
        return reply.code(404).send({ error: `Target service ${targetService} not registered` });
      }

      // Step 4: Resolve capabilities via policy intersection
      const decision = services.policy.resolveCapabilities(
        serviceId,
        targetService,
        targetRegistration.grantedCapabilities,
      );

      if (!decision.allowed) {
        req.log.warn(
          { serviceId, targetService, reason: decision.reason },
          'Token issuance denied by policy',
        );
        return reply.code(403).send({ error: decision.reason });
      }

      // Step 5: Sign JWT with policy-scoped capabilities
      const instanceId = crypto.randomBytes(4).toString('hex');
      const { token, expiresAt, jti } = await services.tokenSigner.signServiceToken(
        registration,
        instanceId,
        targetService,
        decision.capabilities,
      );

      // Step 6: Register in Redis
      await services.revocation.onTokenIssued(jti, serviceId, TOKEN_TTL_SECONDS);

      // Step 7: Update lastSeenAt
      await services.registry.updateLastSeen(serviceId);

      // Step 8: Return token
      req.log.info(
        { serviceId, targetService, jti, caps: decision.capabilities, project: registration.project },
        'Service token issued',
      );

      return reply.send({ token, expiresAt });
    },
  );

  /**
   * POST /v1/tokens/human
   * Exchange Google OAuth token for Verika human token.
   * Auth: none (this IS the auth endpoint)
   *
   * Authorization checks:
   *   1. Google OAuth token must be valid
   *   2. Email domain must be in VERIKA_ALLOWED_HUMAN_DOMAINS (if configured)
   *   3. Target service must exist and have humanRoles in its policy
   *   4. Per-email rate limiting
   */
  app.post<{ Body: { googleToken: string; targetService: string } }>(
    '/v1/tokens/human',
    { schema: humanTokenSchema },
    async (req, reply) => {
      const { googleToken, targetService } = req.body;

      try {
        // Step 1: Validate Google OAuth token
        const { userId, email } = await services.gcpAuth.validateGoogleOAuthToken(googleToken);

        // Step 2: Check email domain authorization
        const { allowedHumanDomains } = services.config;
        if (allowedHumanDomains.length > 0) {
          const emailDomain = email.split('@')[1]?.toLowerCase();
          if (!emailDomain || !allowedHumanDomains.includes(emailDomain)) {
            req.log.warn({ email, emailDomain, allowedHumanDomains }, 'Human token denied: email domain not allowed');
            return reply.code(403).send({ error: 'Email domain not authorized for human token issuance' });
          }
        }

        // Step 3: Rate limiting per email
        if (!checkHumanTokenRate(email)) {
          req.log.warn({ email }, 'Human token denied: rate limit exceeded');
          return reply.code(429).send({ error: 'Rate limit exceeded. Try again later.' });
        }

        // Step 4: Verify target service exists
        const targetRegistration = await services.registry.getService(targetService);
        if (!targetRegistration) {
          return reply.code(404).send({ error: `Target service ${targetService} not registered` });
        }

        // Step 5: Resolve roles from policy (not hardcoded)
        const roles = services.policy.resolveHumanRoles(targetService);
        if (roles.length === 0) {
          req.log.warn({ targetService }, 'Human token denied: no human roles defined for target service');
          return reply.code(403).send({ error: `No human roles defined for service ${targetService}` });
        }

        // Step 6: Sign audience-restricted human token
        const { token, expiresAt, jti } = await services.tokenSigner.signHumanToken(
          userId,
          email,
          roles,
          targetService,
        );

        // Step 7: Register human token in revocation list
        await services.revocation.onTokenIssued(jti, `human:${userId}`, 3600);

        req.log.info({ userId, email, jti, targetService, roles }, 'Human token issued');

        return reply.send({ token, expiresAt });
      } catch (err) {
        req.log.error({ err }, 'Human token exchange failed');
        return reply.code(401).send({ error: 'Token exchange failed' });
      }
    },
  );

  /**
   * POST /v1/tokens/revoke
   * Revoke specific token or all tokens for calling service.
   * Auth: Verika service token (service can only revoke its own)
   */
  app.post<{ Body: { jti?: string; revokeAll?: boolean } }>(
    '/v1/tokens/revoke',
    {
      schema: revokeTokenSchema,
      preHandler: [requireVerikaAuth({ gcpAuth: services.gcpAuth, tokenSigner: services.tokenSigner })],
    },
    async (req, reply) => {
      const identity = (req as typeof req & { verikaIdentity: { sub: string } }).verikaIdentity;
      const { jti, revokeAll } = req.body;

      if (revokeAll) {
        const revokedCount = await services.revocation.revokeAllServiceTokens(identity.sub);
        req.log.warn({ serviceId: identity.sub, revokedCount }, 'All tokens revoked');
        return reply.send({ revokedCount });
      }

      if (jti) {
        await services.revocation.revokeToken(jti, TOKEN_TTL_SECONDS);
        req.log.info({ serviceId: identity.sub, jti }, 'Token revoked');
        return reply.send({ revokedCount: 1 });
      }

      return reply.code(400).send({ error: 'Provide jti or revokeAll' });
    },
  );
}
