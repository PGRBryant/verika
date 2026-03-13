export { VerikaClient } from './client.js';
export { TokenCache } from './token-cache.js';
export { JWKSCache } from './jwks-cache.js';
export { RevocationChecker } from './revocation.js';
export { RevocationMonitor } from './revocation-monitor.js';
export { initiateGracefulShutdown } from './graceful-shutdown.js';
export { createWsReauthHandler } from './ws-reauth.js';

export type {
  VerikaClientOptions,
  ValidatedServiceIdentity,
  ValidatedHumanIdentity,
  ServiceRegistration,
  VerikaWsMessage,
  VerikaErrorCode,
  ServicePolicy,
} from '@internal/verika-shared';

export { VerikaError } from '@internal/verika-shared';
