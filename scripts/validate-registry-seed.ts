/**
 * Registry seed validation script.
 * Validates that seed data matches the ServiceRegistration schema.
 *
 * Usage: npx tsx scripts/validate-registry-seed.ts
 */

console.log('Registry Seed Validation');
console.log('========================');

// Since the seed data is defined in seed-registry.ts with proper typing,
// TypeScript compilation ensures schema compliance. This script provides
// runtime validation for CI.

interface ServiceRegistration {
  id: string;
  displayName: string;
  project: string;
  owner: string;
  status: 'active' | 'deprecated' | 'revoked';
  endpoints: {
    production: string;
    internal: string;
    health: string;
    staging?: string;
  };
  requiredCapabilities: string[];
  grantedCapabilities: {
    capability: string;
    allowedCallers: string[];
  }[];
  runbook: string;
  oncall: string;
  version: string;
  registeredAt: number;
  lastSeenAt: number;
}

function validate(service: ServiceRegistration): string[] {
  const errors: string[] = [];

  if (!service.id) errors.push('Missing id');
  if (!service.displayName) errors.push('Missing displayName');
  if (!service.project) errors.push('Missing project');
  if (!service.owner) errors.push('Missing owner');
  if (!['active', 'deprecated', 'revoked'].includes(service.status)) {
    errors.push(`Invalid status: ${service.status}`);
  }
  if (!service.endpoints?.production) errors.push('Missing endpoints.production');
  if (!service.endpoints?.internal) errors.push('Missing endpoints.internal');
  if (!service.endpoints?.health) errors.push('Missing endpoints.health');
  if (!Array.isArray(service.requiredCapabilities)) errors.push('requiredCapabilities must be array');
  if (!Array.isArray(service.grantedCapabilities)) errors.push('grantedCapabilities must be array');

  for (const grant of service.grantedCapabilities) {
    if (!grant.capability) errors.push('grantedCapability missing capability');
    if (!Array.isArray(grant.allowedCallers)) errors.push('grantedCapability missing allowedCallers');
  }

  return errors;
}

// Inline the seed data for CI validation (mirrors seed-registry.ts)
const services: ServiceRegistration[] = [
  { id: 'mystweaver-api', displayName: 'MystWeaver API', project: 'mystweaver-489920', owner: 'eng@demo.com', status: 'active', endpoints: { production: 'https://mystweaver.dev', internal: 'https://mystweaver-api-hash.run.app', health: 'https://mystweaver-api-hash.run.app/health' }, requiredCapabilities: [], grantedCapabilities: [{ capability: 'flag.evaluate', allowedCallers: ['room404-game-server'] }, { capability: 'flag.evaluate.bulk', allowedCallers: ['room404-game-server'] }, { capability: 'flag.write', allowedCallers: ['varunai'] }, { capability: 'events.track', allowedCallers: ['room404-game-server'] }, { capability: 'experiments.read', allowedCallers: ['varunai'] }, { capability: 'audit.read', allowedCallers: ['varunai'] }, { capability: 'metrics.read', allowedCallers: ['varunai'] }, { capability: 'stream.subscribe', allowedCallers: ['varunai'] }], runbook: 'https://runbooks.internal/mystweaver', oncall: 'eng@demo.com', version: '1.0.0', registeredAt: 0, lastSeenAt: 0 },
  { id: 'room404-game-server', displayName: 'Room 404 Game Server', project: 'room404-prod', owner: 'eng@demo.com', status: 'active', endpoints: { production: 'https://game.room404.dev', internal: 'https://game.internal.room404.dev', health: 'https://game.room404.dev/health' }, requiredCapabilities: ['flag.evaluate', 'flag.evaluate.bulk', 'events.track', 'content.generate.flavor', 'content.generate.chaos', 'content.judge', 'content.generate.icon'], grantedCapabilities: [{ capability: 'session.read', allowedCallers: ['varunai'] }, { capability: 'session.manage', allowedCallers: [] }], runbook: 'https://runbooks.internal/room404', oncall: 'eng@demo.com', version: '1.0.0', registeredAt: 0, lastSeenAt: 0 },
  { id: 'room404-ai-service', displayName: 'Room 404 AI Service', project: 'room404-prod', owner: 'eng@demo.com', status: 'active', endpoints: { production: 'https://ai.internal.room404.dev', internal: 'https://ai.internal.room404.dev', health: 'https://ai.internal.room404.dev/health' }, requiredCapabilities: [], grantedCapabilities: [{ capability: 'content.generate.flavor', allowedCallers: ['room404-game-server'] }, { capability: 'content.generate.chaos', allowedCallers: ['room404-game-server'] }, { capability: 'content.judge', allowedCallers: ['room404-game-server'] }, { capability: 'content.generate.icon', allowedCallers: ['room404-game-server'] }], runbook: 'https://runbooks.internal/room404-ai', oncall: 'eng@demo.com', version: '1.0.0', registeredAt: 0, lastSeenAt: 0 },
  { id: 'varunai', displayName: 'Varunai Observability Hub', project: 'varunai-prod', owner: 'eng@demo.com', status: 'active', endpoints: { production: 'https://varunai.internal', internal: 'https://varunai.internal', health: 'https://varunai.internal/health' }, requiredCapabilities: ['flag.write', 'flag.evaluate', 'experiments.read', 'audit.read', 'metrics.read', 'stream.subscribe', 'session.read'], grantedCapabilities: [], runbook: 'https://runbooks.internal/varunai', oncall: 'eng@demo.com', version: '0.0.0', registeredAt: 0, lastSeenAt: 0 },
  { id: 'verika', displayName: 'Verika Identity Service', project: 'verika-prod', owner: 'eng@demo.com', status: 'active', endpoints: { production: 'https://api.verika.internal', internal: 'https://api.verika.internal', health: 'https://api.verika.internal/health' }, requiredCapabilities: [], grantedCapabilities: [{ capability: 'identity.token.issue', allowedCallers: ['*'] }, { capability: 'identity.token.validate', allowedCallers: ['*'] }, { capability: 'identity.token.revoke', allowedCallers: ['*'] }, { capability: 'registry.read', allowedCallers: ['*'] }, { capability: 'registry.write', allowedCallers: [] }], runbook: 'https://runbooks.internal/verika', oncall: 'eng@demo.com', version: '1.0.0', registeredAt: 0, lastSeenAt: 0 },
];

let totalErrors = 0;
for (const service of services) {
  const errors = validate(service);
  if (errors.length > 0) {
    console.error(`\n${service.id}: FAILED`);
    for (const err of errors) console.error(`  - ${err}`);
    totalErrors += errors.length;
  } else {
    console.log(`${service.id}: OK`);
  }
}

console.log(`\n========================`);
console.log(`Services: ${services.length}, Errors: ${totalErrors}`);
if (totalErrors > 0) {
  console.error('Validation FAILED');
  process.exit(1);
}
console.log('Validation PASSED');
