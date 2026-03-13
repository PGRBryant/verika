/**
 * Seed script for Verika service registry.
 * Populates Firestore with the initial set of registered services.
 *
 * Usage: npx tsx scripts/seed-registry.ts
 */

import { Firestore } from '@google-cloud/firestore';
import type { ServiceRegistration } from '@internal/verika-shared';

const PROJECT_ID = process.env['GCP_PROJECT_ID'] ?? 'verika-prod';
const DATABASE_ID = process.env['FIRESTORE_DATABASE'] ?? 'verika-registry';
const COLLECTION = 'service_registry';

const db = new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID });

const services: ServiceRegistration[] = [
  {
    id: 'mystweaver-api',
    displayName: 'MystWeaver API',
    project: 'mystweaver-489920',
    owner: 'eng@demo.com',
    status: 'active',
    endpoints: {
      production: 'https://mystweaver.dev',
      internal: 'https://mystweaver-api-hash.run.app',
      health: 'https://mystweaver-api-hash.run.app/health',
    },
    requiredCapabilities: [],
    grantedCapabilities: [
      { capability: 'flag.evaluate', allowedCallers: ['room404-game-server'] },
      { capability: 'flag.evaluate.bulk', allowedCallers: ['room404-game-server'] },
      { capability: 'flag.write', allowedCallers: ['varunai'] },
      { capability: 'events.track', allowedCallers: ['room404-game-server'] },
      { capability: 'experiments.read', allowedCallers: ['varunai'] },
      { capability: 'audit.read', allowedCallers: ['varunai'] },
      { capability: 'metrics.read', allowedCallers: ['varunai'] },
      { capability: 'stream.subscribe', allowedCallers: ['varunai'] },
    ],
    runbook: 'https://runbooks.internal/mystweaver',
    oncall: 'eng@demo.com',
    version: '1.0.0',
    registeredAt: Date.now(),
    lastSeenAt: Date.now(),
  },
  {
    id: 'room404-game-server',
    displayName: 'Room 404 Game Server',
    project: 'room404-prod',
    owner: 'eng@demo.com',
    status: 'active',
    endpoints: {
      production: 'https://game.room404.dev',
      internal: 'https://game.internal.room404.dev',
      health: 'https://game.room404.dev/health',
    },
    requiredCapabilities: [
      'flag.evaluate', 'flag.evaluate.bulk', 'events.track',
      'content.generate.flavor', 'content.generate.chaos',
      'content.judge', 'content.generate.icon',
    ],
    grantedCapabilities: [
      { capability: 'session.read', allowedCallers: ['varunai'] },
      { capability: 'session.manage', allowedCallers: [] }, // humans only
    ],
    runbook: 'https://runbooks.internal/room404',
    oncall: 'eng@demo.com',
    version: '1.0.0',
    registeredAt: Date.now(),
    lastSeenAt: Date.now(),
  },
  {
    id: 'room404-ai-service',
    displayName: 'Room 404 AI Service',
    project: 'room404-prod',
    owner: 'eng@demo.com',
    status: 'active',
    endpoints: {
      production: 'https://ai.internal.room404.dev',
      internal: 'https://ai.internal.room404.dev',
      health: 'https://ai.internal.room404.dev/health',
    },
    requiredCapabilities: [],
    grantedCapabilities: [
      { capability: 'content.generate.flavor', allowedCallers: ['room404-game-server'] },
      { capability: 'content.generate.chaos', allowedCallers: ['room404-game-server'] },
      { capability: 'content.judge', allowedCallers: ['room404-game-server'] },
      { capability: 'content.generate.icon', allowedCallers: ['room404-game-server'] },
    ],
    runbook: 'https://runbooks.internal/room404-ai',
    oncall: 'eng@demo.com',
    version: '1.0.0',
    registeredAt: Date.now(),
    lastSeenAt: Date.now(),
  },
  {
    id: 'varunai',
    displayName: 'Varunai Observability Hub',
    project: 'varunai-prod',
    owner: 'eng@demo.com',
    status: 'active',
    endpoints: {
      production: 'https://varunai.internal',
      internal: 'https://varunai.internal',
      health: 'https://varunai.internal/health',
    },
    requiredCapabilities: [
      'flag.write', 'flag.evaluate', 'experiments.read',
      'audit.read', 'metrics.read', 'stream.subscribe',
      'session.read',
    ],
    grantedCapabilities: [], // varunai receives, does not expose
    runbook: 'https://runbooks.internal/varunai',
    oncall: 'eng@demo.com',
    version: '0.0.0', // Not yet built
    registeredAt: Date.now(),
    lastSeenAt: Date.now(),
  },
  {
    id: 'verika',
    displayName: 'Verika Identity Service',
    project: 'verika-prod',
    owner: 'eng@demo.com',
    status: 'active',
    endpoints: {
      production: 'https://api.verika.internal',
      internal: 'https://api.verika.internal',
      health: 'https://api.verika.internal/health',
    },
    requiredCapabilities: [],
    grantedCapabilities: [
      { capability: 'identity.token.issue', allowedCallers: ['*'] },
      { capability: 'identity.token.validate', allowedCallers: ['*'] },
      { capability: 'identity.token.revoke', allowedCallers: ['*'] },
      { capability: 'registry.read', allowedCallers: ['*'] },
      { capability: 'registry.write', allowedCallers: [] }, // humans only
    ],
    runbook: 'https://runbooks.internal/verika',
    oncall: 'eng@demo.com',
    version: '1.0.0',
    registeredAt: Date.now(),
    lastSeenAt: Date.now(),
  },
];

async function seed(): Promise<void> {
  console.log(`Seeding ${services.length} services into ${DATABASE_ID}/${COLLECTION}...`);

  const batch = db.batch();
  for (const service of services) {
    const ref = db.collection(COLLECTION).doc(service.id);
    batch.set(ref, service);
    console.log(`  + ${service.id} (${service.project})`);
  }

  await batch.commit();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
