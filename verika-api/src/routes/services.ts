import type { FastifyInstance } from 'fastify';
import type { RegistryService } from '../services/registry.js';
import type { TokenSignerService } from '../services/token-signer.js';
import type { GcpAuthService } from '../services/gcp-auth.js';
import { requireVerikaAuth } from '../middleware/auth.js';

interface ServiceRouteServices {
  registry: RegistryService;
  tokenSigner: TokenSignerService;
  gcpAuth: GcpAuthService;
}

export function registerServiceRoutes(
  app: FastifyInstance,
  services: ServiceRouteServices,
): void {
  const authMiddleware = requireVerikaAuth({
    gcpAuth: services.gcpAuth,
    tokenSigner: services.tokenSigner,
  });

  /**
   * GET /v1/services/:serviceId
   * Full service registration.
   * Auth: Verika service token
   */
  app.get<{ Params: { serviceId: string } }>(
    '/v1/services/:serviceId',
    { preHandler: [authMiddleware] },
    async (req, reply) => {
      const { serviceId } = req.params;
      const registration = await services.registry.getService(serviceId);

      if (!registration) {
        return reply.code(404).send({ error: `Service ${serviceId} not found` });
      }

      return reply.send(registration);
    },
  );

  /**
   * GET /v1/services/:serviceId/status
   * Status only — fast path for revocation monitor.
   * Auth: Verika service token
   */
  app.get<{ Params: { serviceId: string } }>(
    '/v1/services/:serviceId/status',
    { preHandler: [authMiddleware] },
    async (req, reply) => {
      const { serviceId } = req.params;
      const registration = await services.registry.getService(serviceId);

      if (!registration) {
        return reply.code(404).send({ error: `Service ${serviceId} not found` });
      }

      return reply.send({ status: registration.status });
    },
  );
}
