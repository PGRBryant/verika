import type { FastifyInstance } from 'fastify';
import type { TokenSignerService } from '../services/token-signer.js';

interface JwksServices {
  tokenSigner: TokenSignerService;
}

export function registerJwksRoute(
  app: FastifyInstance,
  services: JwksServices,
): void {
  app.get('/v1/jwks', async (_req, reply) => {
    const jwks = await services.tokenSigner.getPublicKeys();
    await reply
      .header('Cache-Control', 'max-age=300')
      .header('Content-Type', 'application/json')
      .send(jwks);
  });
}
