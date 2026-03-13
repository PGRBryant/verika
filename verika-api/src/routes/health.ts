import type { FastifyInstance } from 'fastify';
import type { RegistryService } from '../services/registry.js';
import type { RevocationService } from '../services/revocation.js';
import type { TokenSignerService } from '../services/token-signer.js';
import type { VerikaApiConfig } from '../config.js';

interface HealthServices {
  registry: RegistryService;
  revocation: RevocationService;
  tokenSigner: TokenSignerService;
  config: VerikaApiConfig;
}

const startTime = Date.now();

export function registerHealthRoute(
  app: FastifyInstance,
  services: HealthServices,
): void {
  // Lightweight startup/readiness probe — just confirms the process is alive
  app.get('/ready', async (_req, reply) => {
    await reply.code(200).send({ status: 'ok' });
  });

  app.get('/health', async (_req, reply) => {
    const [firestoreHealth, redisHealth, kmsHealth] = await Promise.all([
      services.registry.checkHealth(),
      services.revocation.checkHealth(),
      services.tokenSigner.checkHealth(),
    ]);

    const allOk =
      firestoreHealth.status === 'ok' &&
      redisHealth.status === 'ok' &&
      kmsHealth.status === 'ok';

    const anyUnhealthy =
      firestoreHealth.status === 'unhealthy' ||
      redisHealth.status === 'unhealthy' ||
      kmsHealth.status === 'unhealthy';

    const overallStatus = allOk ? 'ok' : anyUnhealthy ? 'unhealthy' : 'degraded';

    const response = {
      status: overallStatus,
      checks: {
        firestore: firestoreHealth,
        redis: redisHealth,
        kms: kmsHealth,
      },
      version: process.env['npm_package_version'] ?? '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };

    // Degraded = still operational but needs attention; don't trigger load balancer removal
    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    await reply.code(statusCode).send(response);
  });
}
