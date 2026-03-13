import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ValidatedServiceIdentity, ValidatedHumanIdentity } from '@internal/verika-shared';
import type { VerikaClient } from './client.js';
import { isInShutdown } from './graceful-shutdown.js';

interface VerikaPluginOptions {
  verika: VerikaClient;
  mtls?: {
    required: boolean; // V1: always false
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    verikaIdentity: ValidatedServiceIdentity | ValidatedHumanIdentity | null;
    can: (capability: string) => boolean;
  }
  interface FastifyInstance {
    requireCapability: (capability: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const verikaPlugin = fp(
  async (app: FastifyInstance, opts: VerikaPluginOptions) => {
    const { verika } = opts;

    // Decorate request with identity and capability check
    app.decorateRequest('verikaIdentity', null);
    app.decorateRequest('can', function (this: FastifyRequest, _capability: string): boolean {
      return false; // Default — overridden in hook
    });

    // Decorate app with capability guard factory
    app.decorate(
      'requireCapability',
      (capability: string) => {
        return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
          if (!req.can(capability)) {
            await reply.code(403).send({
              error: 'Insufficient capability',
              required: capability,
            });
          }
        };
      },
    );

    // Global onRequest hook — authenticate all requests
    app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      // Check graceful shutdown
      if (isInShutdown()) {
        await reply.code(503).send({ error: 'Service shutting down' });
        return;
      }

      // Skip auth for explicitly opted-out routes
      const routeConfig = req.routeOptions?.config as Record<string, unknown> | undefined;
      if (routeConfig?.['verika'] === false) {
        return;
      }

      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) {
        await reply.code(401).send({ error: 'Missing authorization' });
        return;
      }

      const token = auth.slice(7);
      const startTime = Date.now();

      try {
        // Try service token first, then human token
        let identity: ValidatedServiceIdentity | ValidatedHumanIdentity;

        try {
          identity = await verika.validateServiceToken(token);
        } catch {
          identity = await verika.validateHumanToken(token);
        }

        req.verikaIdentity = identity;

        // Set up capability check
        req.can = (capability: string): boolean => {
          if ('capabilities' in identity) {
            return identity.capabilities.includes(capability);
          }
          if ('roles' in identity) {
            // Human tokens — capability check against roles
            return identity.roles.some((role) => role.includes(capability));
          }
          return false;
        };

        // Emit audit log entry
        const durationMs = Date.now() - startTime;
        const traceId = req.headers['x-cloud-trace-context'] as string | undefined;

        const auditEntry: Record<string, unknown> = {
          type: 'verika.audit',
          target: opts.verika.constructor.name, // Will be the service name in practice
          allowed: true,
          durationMs,
          traceId: traceId?.split('/')[0] ?? null,
          spanId: traceId?.split('/')[1]?.split(';')[0] ?? null,
          timestamp: new Date().toISOString(),
        };

        if ('serviceId' in identity) {
          auditEntry['caller'] = identity.serviceId;
          auditEntry['callerVersion'] = identity.version;
          auditEntry['callerProject'] = identity.project;
          auditEntry['callerTokenId'] = identity.tokenId;
        } else {
          auditEntry['caller'] = identity.userId;
          auditEntry['callerTokenId'] = identity.tokenId;
        }

        req.log.info(auditEntry, 'verika.audit');
      } catch (err) {
        const durationMs = Date.now() - startTime;
        req.log.warn(
          { type: 'verika.audit', allowed: false, durationMs, err },
          'verika.audit.denied',
        );
        await reply.code(401).send({ error: 'Invalid token' });
      }
    });
  },
  {
    name: 'verika-plugin',
    fastify: '4.x',
  },
);
