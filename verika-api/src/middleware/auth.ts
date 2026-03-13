import type { FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import type { GcpAuthService } from '../services/gcp-auth.js';
import type { TokenSignerService } from '../services/token-signer.js';

export interface AuthServices {
  gcpAuth: GcpAuthService;
  tokenSigner: TokenSignerService;
}

/**
 * Middleware: requires GCP Workload Identity token.
 * Used for bootstrap endpoints (token issuance).
 */
export function requireGcpAuth(authServices: AuthServices) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const identity = await authServices.gcpAuth.validateGcpIdentity(
        req.headers.authorization,
      );
      (req as FastifyRequest & { gcpIdentity: typeof identity }).gcpIdentity = identity;
    } catch {
      await reply.code(401).send({ error: 'Invalid GCP identity' });
    }
  };
}

/**
 * Middleware: requires a valid Verika service token.
 * Validates JWT signature locally against cached JWKS.
 */
export function requireVerikaAuth(authServices: AuthServices) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      await reply.code(401).send({ error: 'Missing authorization' });
      return;
    }

    const token = auth.slice(7);

    try {
      const jwks = await authServices.tokenSigner.getPublicKeys();
      const keySet = jose.createLocalJWKSet(jwks as jose.JSONWebKeySet);
      const { payload } = await jose.jwtVerify(token, keySet, {
        issuer: 'verika',
      });

      (req as FastifyRequest & { verikaIdentity: typeof payload }).verikaIdentity = payload;
    } catch {
      await reply.code(401).send({ error: 'Invalid Verika token' });
    }
  };
}
