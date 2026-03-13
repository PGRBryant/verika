// --- Token Payloads ---

export interface ServiceTokenPayload {
  iss: 'verika';
  sub: string;
  ver: string;
  proj: string;
  region: string;
  instance: string;
  caps: string[];
  iat: number;
  exp: number;
  jti: string;
}

export interface HumanTokenPayload {
  iss: 'verika';
  sub: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
  jti: string;
}

// --- Validated Identities ---

export interface ValidatedServiceIdentity {
  serviceId: string;
  version: string;
  project: string;
  capabilities: string[];
  tokenId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface ValidatedHumanIdentity {
  userId: string;
  email: string;
  roles: string[];
  tokenId: string;
  issuedAt: number;
  expiresAt: number;
}

// --- Client Options ---

export interface VerikaClientOptions {
  service: string;
  verikaEndpoint: string;
  mtls?: {
    enabled: boolean;
    certTTL?: number;
  };
  continuousAuth?: {
    /** Default: 60000 */
    revocationCheckInterval?: number;
    /** V2: 300000 */
    wsReauthInterval?: number;
  };
}

// --- WebSocket Reauth Messages (discriminated union) ---

export interface ReauthRequiredMessage {
  type: 'REAUTH_REQUIRED';
  deadline: number;
}

export interface ReauthAckMessage {
  type: 'REAUTH_ACK';
}

export interface ReauthMessage {
  type: 'REAUTH';
  token: string;
}

export type VerikaWsMessage =
  | ReauthRequiredMessage
  | ReauthAckMessage
  | ReauthMessage;
