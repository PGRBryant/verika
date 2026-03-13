/**
 * Phase 0 — What it looks like in an existing service
 *
 * This file shows exactly what Phase 0 migration adds to a service.
 * Phase 0 is preparation — no behavior changes, no new dependencies
 * in the hot path, just env vars, TODOs, and type extensions.
 *
 * Apply this pattern to both MystWeaver and Room 404 immediately.
 */

// ─── Step 1: Environment Variables ─────────────────────────────────────────
// Set but unused in Phase 0. Ready for Phase 1 import.

// .env:
//   VERIKA_ENDPOINT=https://api.verika.internal
//   VERIKA_SERVICE_ID=mystweaver-api      # or room404-game-server

const _VERIKA_ENDPOINT = process.env['VERIKA_ENDPOINT'];
const _VERIKA_SERVICE_ID = process.env['VERIKA_SERVICE_ID'];

// ─── Step 2: Optional Dependency ───────────────────────────────────────────
// Added to package.json but NOT imported in production code yet.

// package.json:
//   "optionalDependencies": {
//     "@internal/verika": "^1.0.0"
//   }

// ─── Step 3: TODO Comments at Auth Decision Points ─────────────────────────
// Every place that checks auth gets a TODO(verika) comment.

// In MystWeaver SDK auth middleware:
async function authenticateRequest(_req: { headers: { authorization?: string } }): Promise<void> {
  // TODO(verika): Add Verika service token validation path here.
  // When Verika is live, internal services (room404-game-server, varunai)
  // will present Verika JWTs instead of SDK keys. Detect by prefix:
  // eyJ... = Verika JWT, mw_sdk_... = SDK key. Both paths remain valid.
  // See examples/mystweaver-integration.ts for the full pattern.

  // Existing SDK key validation continues unchanged:
  // const auth = req.headers.authorization;
  // if (!auth?.startsWith('Bearer mw_sdk_')) throw new Error('UNAUTHORIZED');
  // ... existing validation ...
}

// In Room 404 outbound calls:
async function callAIService(_prompt: string): Promise<void> {
  // TODO(verika): Replace hardcoded URL with verika.serviceUrl('room404-ai-service').
  // Replace auth header with verika.serviceToken().
  // See examples/room404-integration.ts for the full pattern.

  // const response = await fetch('https://ai.internal.room404.dev/generate', {
  //   headers: { Authorization: `Bearer ${hardcodedApiKey}` },
  // });
}

// In Room 404 MystweaverClient instantiation:
function createMystweaverClient(): void {
  // TODO(verika): Replace apiKey with identity: verika.
  // MystweaverClient constructor accepts { identity: VerikaClient }
  // as an alternative to { apiKey: string }.
  // See examples/room404-integration.ts for the full pattern.

  // const client = new MystweaverClient({
  //   apiKey: process.env.MYSTWEAVER_SDK_KEY,
  //   baseUrl: process.env.MYSTWEAVER_URL,
  // });
}

// In Room 404 presenter auth:
async function handlePresenterLogin(): Promise<void> {
  // TODO(verika): Replace direct Google OAuth validation with
  // verika.exchangeGoogleToken(). Returns a Verika human token
  // with role room404.presenter. Covers both Room 404 and Varunai.
  // See examples/room404-integration.ts for the full pattern.
}

// ─── Step 4: WS Message Types ──────────────────────────────────────────────
// Add to Room 404 shared types (packages/shared):

// In packages/shared/src/ws-messages.ts (or equivalent):
//
// | { type: 'REAUTH_REQUIRED'; deadline: number }
// | { type: 'REAUTH_ACK' }
// | { type: 'REAUTH'; token: string }

// ─── Step 5: MystweaverClient Identity Param ───────────────────────────────
// Add identity option to constructor — falls through to SDK key if absent.

interface MystweaverClientOptions {
  apiKey?: string;
  identity?: { serviceToken(): string };  // VerikaClient shape
  baseUrl: string;
}

function _getAuthHeader(options: MystweaverClientOptions): string {
  // TODO(verika): When identity is provided, use verika.serviceToken().
  // When apiKey is provided, use SDK key as before (external callers).
  if (options.identity) {
    return `Bearer ${options.identity.serviceToken()}`;
  }
  return `Bearer ${options.apiKey}`;
}

export {
  authenticateRequest,
  callAIService,
  createMystweaverClient,
  handlePresenterLogin,
};
