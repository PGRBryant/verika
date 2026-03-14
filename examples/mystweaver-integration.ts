/**
 * MystWeaver API — Verika Integration Example
 *
 * Shows the complete integration pattern for MystWeaver:
 * - Two-path auth (Verika JWT + SDK key) on SDK routes
 * - Google IAP retained for admin UI (unchanged)
 * - /metrics dual auth (IAP + Verika metrics.read)
 * - SSE /sdk/stream dual auth (SDK key + Verika stream.subscribe)
 * - Audit log enrichment with Verika identity fields
 *
 * MystWeaver's pino logging is already structured JSON — correct.
 * Verika adds fields, does not restructure.
 */

import { VerikaClient } from '@internal/verika';
import type { ValidatedServiceIdentity } from '@internal/verika-shared';
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'node:crypto';

// ─── Initialize Verika Client ──────────────────────────────────────────────

const verika = new VerikaClient({
  service: 'mystweaver-api',
  targetService: 'verika',
  verikaEndpoint: process.env['VERIKA_ENDPOINT']!,
});

// Call during server startup, before accepting traffic
// await verika.ready();

// ─── Two-Path Auth Middleware ──────────────────────────────────────────────
// MystWeaver's SDK routes accept both Verika tokens (internal services)
// and SDK keys (external callers). Detection is by token prefix.

interface AuthResult {
  type: 'verika' | 'sdk-key';
  identity?: ValidatedServiceIdentity;
  projectId?: string;
}

async function authenticateSDKRequest(req: FastifyRequest): Promise<AuthResult> {
  const auth = req.headers.authorization;

  // Path 1: Verika service token (internal services)
  // eyJ is the base64url prefix for '{"' — JWT header start
  if (auth?.startsWith('Bearer eyJ')) {
    const identity = await verika.validateServiceToken(
      auth.replace('Bearer ', ''),
      { allowedServices: ['room404-game-server', 'varunai'] },
    );
    return { type: 'verika', identity };
  }

  // Path 2: SDK key (external callers, existing behavior)
  if (auth?.startsWith('Bearer mw_sdk_')) {
    const keyHash = crypto
      .createHash('sha256')
      .update(auth.replace('Bearer ', ''))
      .digest('hex');

    // Existing Firestore lookup for SDK key validation
    // const keyDoc = await firestore
    //   .collection(`projects/${projectId}/sdk-keys`)
    //   .where('keyHash', '==', keyHash)
    //   .limit(1)
    //   .get();
    // if (keyDoc.empty) throw new Error('INVALID_SDK_KEY');

    return { type: 'sdk-key', projectId: 'looked-up-project-id' };
  }

  throw new Error('UNAUTHORIZED');
}

// ─── /metrics Dual Auth ────────────────────────────────────────────────────
// Protected by admin auth today. After Verika: also accept Verika tokens
// with metrics.read capability. Varunai scrapes this endpoint.

async function metricsRouteHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // requireOneOf: accept either IAP admin auth or Verika metrics.read
  const isIAPAuth = req.headers['x-goog-authenticated-user-email'] !== undefined;

  if (!isIAPAuth) {
    // Try Verika auth
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer eyJ')) {
      const identity = await verika.validateServiceToken(auth.replace('Bearer ', ''));
      if (!identity.capabilities.includes('metrics.read')) {
        await reply.code(403).send({ error: 'Missing metrics.read capability' });
        return;
      }
      // Verika auth valid with metrics.read — proceed
    } else {
      await reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
  }

  // Return Prometheus metrics
  await reply.type('text/plain').send('# Prometheus metrics here');
}

// ─── SSE /sdk/stream Dual Auth ─────────────────────────────────────────────
// Currently authenticated by SDK key. Varunai connects with Verika token.

async function sseStreamHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authResult = await authenticateSDKRequest(req);

  if (authResult.type === 'verika') {
    // Verify stream.subscribe capability
    if (!authResult.identity?.capabilities.includes('stream.subscribe')) {
      await reply.code(403).send({ error: 'Missing stream.subscribe capability' });
      return;
    }
  }

  // Both auth paths valid — set up SSE stream
  await reply.type('text/event-stream').send('data: connected\n\n');
}

// ─── Audit Log Enrichment ──────────────────────────────────────────────────
// MystWeaver's audit log already captures who made flag changes.
// When Verika token is the auth path, add Verika identity fields.

function enrichAuditEntry(
  existingAuditFields: Record<string, unknown>,
  authResult: AuthResult,
  req: FastifyRequest,
): Record<string, unknown> {
  return {
    ...existingAuditFields,
    callerService: authResult.identity?.serviceId ?? null,
    callerVersion: authResult.identity?.version ?? null,
    verikaTokenId: authResult.identity?.tokenId ?? null,
    traceId: (req.headers['x-cloud-trace-context'] as string)?.split('/')[0] ?? null,
  };
}

export {
  authenticateSDKRequest,
  metricsRouteHandler,
  sseStreamHandler,
  enrichAuditEntry,
};
