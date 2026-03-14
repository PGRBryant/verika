/**
 * Room 404 — Verika Integration Example
 *
 * Room 404 has three distinct auth contexts:
 * 1. Service-to-service (game server → AI service, → MystWeaver)
 * 2. Presenter human auth (Google OAuth → Verika human token)
 * 3. Player tokens (NOT Verika — game constructs, intentionally separate)
 */

import { VerikaClient } from '@internal/verika';

// ═══════════════════════════════════════════════════════════════════
// 1. SERVICE-TO-SERVICE
// ═══════════════════════════════════════════════════════════════════

// First operational lines after OTel init in apps/server/src/index.ts:

const verika = new VerikaClient({
  service: 'room404-game-server',
  targetService: 'mystweaver-api',
  verikaEndpoint: process.env['VERIKA_ENDPOINT']!,
});

// Service does not start until Verika token is issued.
// await verika.ready();

// ─── Outbound call to AI Service ────────────────────────────────────────────

async function generateFlavorText(prompt: string): Promise<string> {
  const aiServiceUrl = await verika.serviceUrl('room404-ai-service');

  const response = await fetch(`${aiServiceUrl}/generate/flavor`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${verika.serviceToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`AI service error: ${response.status}`);
  }

  const data = (await response.json()) as { text: string };
  return data.text;
}

// ─── MystweaverClient with Verika identity ─────────────────────────────────
// MystweaverClient needs a small update to accept identity:
//   Currently accepts: { apiKey: string, baseUrl: string }
//   Add:              { identity: VerikaClient, baseUrl: string }
//   When identity is provided: use verika.serviceToken() as Bearer token
//   When apiKey is provided: use SDK key as before (external callers)

interface MystweaverClientOptions {
  apiKey?: string;
  identity?: VerikaClient;
  baseUrl: string;
}

class MystweaverClient {
  private readonly options: MystweaverClientOptions;

  constructor(options: MystweaverClientOptions) {
    this.options = options;
  }

  private getAuthHeader(): string {
    if (this.options.identity) {
      return `Bearer ${this.options.identity.serviceToken()}`;
    }
    return `Bearer ${this.options.apiKey}`;
  }

  async evaluateFlag(flagKey: string, context: Record<string, unknown>): Promise<boolean> {
    const response = await fetch(`${this.options.baseUrl}/sdk/evaluate`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ flagKey, context }),
    });

    const data = (await response.json()) as { value: boolean };
    return data.value;
  }
}

// Usage — internal service uses Verika identity:
async function initMystweaverClient(): Promise<MystweaverClient> {
  return new MystweaverClient({
    identity: verika,
    baseUrl: await verika.serviceUrl('mystweaver-api'),
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2. PRESENTER HUMAN AUTH
// ═══════════════════════════════════════════════════════════════════

// Flow:
// 1. Presenter opens /present/:sessionCode
// 2. Client redirects to Google OAuth
// 3. Client calls POST /api/auth/presenter
// 4. Server exchanges Google token for Verika human token
// 5. Returns Verika human token → stored in sessionStorage
// 6. All presenter WS messages include Verika human token

async function handlePresenterAuth(
  googleToken: string,
  sessionCode: string,
): Promise<{ verikaToken: string }> {
  // Step 4: Exchange Google token for Verika human token
  const verikaToken = await verika.exchangeGoogleToken(googleToken);

  // Step 5: Validate the token has the presenter role
  const identity = await verika.validateHumanToken(verikaToken, {
    requiredRole: 'room404.presenter',
  });

  console.log(`Presenter authenticated: ${identity.email} for session ${sessionCode}`);

  // Step 6: Return token — client stores in sessionStorage
  return { verikaToken };
}

// Step 8: Validate presenter token on WS messages
async function validatePresenterWsMessage(token: string): Promise<boolean> {
  try {
    await verika.validateHumanToken(token, {
      requiredRole: 'room404.presenter',
    });
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. PLAYER TOKENS — NOT VERIKA
// ═══════════════════════════════════════════════════════════════════

// NOTE: Player tokens are Room 404 session constructs, not Verika
// identity tokens. They are intentionally separate.
//
// Player tokens answer "which player are you in this session?"
// They are NOT ecosystem identity. Do not route through Verika. Ever.
//
// Player token structure (Room 404 internal):
// {
//   sessionCode: "ABC123",
//   playerIndex: 2,
//   playerName: "Alice",
//   joinedAt: 1710000000
// }

export {
  verika,
  generateFlavorText,
  initMystweaverClient,
  handlePresenterAuth,
  validatePresenterWsMessage,
};
