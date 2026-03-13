import type { FastifyInstance } from 'fastify';
import * as crypto from 'node:crypto';
import type { RegistryService } from '../services/registry.js';
import type { TokenSignerService } from '../services/token-signer.js';
import type { RevocationService } from '../services/revocation.js';
import type { GcpAuthService, GcpIdentity } from '../services/gcp-auth.js';
import { requireGcpAuth, requireVerikaAuth } from '../middleware/auth.js';

interface TokenServices {
  registry: RegistryService;
  tokenSigner: TokenSignerService;
  revocation: RevocationService;
  gcpAuth: GcpAuthService;
}

// Presenter role mappings for Google OAuth → Verika human token
const PRESENTER_ROLES = ['room404.presenter', 'mystweaver.viewer', 'varunai.presenter'];

const TOKEN_TTL_SECONDS = 900;

export function registerTokenRoutes(
  app: FastifyInstance,
  services: TokenServices,
): void {
  /**
   * POST /v1/tokens/service
   * Issue a service token.
   * Auth: GCP Workload Identity (bootstrap — not a Verika token)
   */
  app.post<{ Body: { serviceId: string } }>(
    '/v1/tokens/service',
    {
      preHandler: [requireGcpAuth({ gcpAuth: services.gcpAuth, tokenSigner: services.tokenSigner })],
    },
    async (req, reply) => {
      const { serviceId } = req.body;
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

      // Step 3-4: Load capabilities and sign JWT
      const instanceId = crypto.randomBytes(4).toString('hex');
      const { token, expiresAt, jti } = await services.tokenSigner.signServiceToken(
        registration,
        instanceId,
      );

      // Step 5-6: Register in Redis
      await services.revocation.onTokenIssued(jti, serviceId, TOKEN_TTL_SECONDS);

      // Step 7: Update lastSeenAt
      await services.registry.updateLastSeen(serviceId);

      // Step 8: Return token
      req.log.info(
        { serviceId, jti, project: registration.project },
        'Service token issued',
      );

      return reply.send({ token, expiresAt });
    },
  );

  /**
   * POST /v1/tokens/human
   * Exchange Google OAuth token for Verika human token.
   * Auth: none (this IS the auth endpoint)
   */
  app.post<{ Body: { googleToken: string } }>(
    '/v1/tokens/human',
    async (req, reply) => {
      const { googleToken } = req.body;

      try {
        const { userId, email } = await services.gcpAuth.validateGoogleOAuthToken(googleToken);
        const { token, expiresAt, jti } = await services.tokenSigner.signHumanToken(
          userId,
          email,
          PRESENTER_ROLES,
        );

        // Register human token in revocation list
        await services.revocation.onTokenIssued(jti, `human:${userId}`, 3600);

        req.log.info({ userId, email, jti }, 'Human token issued');

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
