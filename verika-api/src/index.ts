import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { registerTokenRoutes } from './routes/tokens.js';
import { registerServiceRoutes } from './routes/services.js';
import { registerJwksRoute } from './routes/jwks.js';
import { registerHealthRoute } from './routes/health.js';
import { RegistryService } from './services/registry.js';
import { TokenSignerService } from './services/token-signer.js';
import { RevocationService } from './services/revocation.js';
import { GcpAuthService } from './services/gcp-auth.js';
import { PolicyService } from './services/policy.js';

const config = loadConfig();

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
});

const registry = new RegistryService(config);
const tokenSigner = new TokenSignerService(config);
const revocation = new RevocationService(config);
const gcpAuth = new GcpAuthService(config);
const policy = new PolicyService();

const services = { registry, tokenSigner, revocation, gcpAuth, policy, config };

registerHealthRoute(app, services);
registerJwksRoute(app, services);
registerTokenRoutes(app, services);
registerServiceRoutes(app, services);

async function start(): Promise<void> {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info({ port: config.port, environment: config.environment }, 'Verika API started');
  } catch (err) {
    app.log.fatal(err, 'Failed to start Verika API');
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Shutting down Verika API');
  await app.close();
  await revocation.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
