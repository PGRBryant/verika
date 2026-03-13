/**
 * Emergency Revocation Script
 *
 * Immediately revokes all tokens for a compromised service.
 * This is the nuclear option — use when a service is compromised.
 *
 * Usage: npx tsx scripts/emergency-revoke.ts <serviceId>
 * Example: npx tsx scripts/emergency-revoke.ts room404-game-server
 */

import Redis from 'ioredis';
import { Firestore } from '@google-cloud/firestore';

const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
const PROJECT_ID = process.env['GCP_PROJECT_ID'] ?? 'verika-prod';
const DATABASE_ID = process.env['FIRESTORE_DATABASE'] ?? 'verika-registry';

const serviceId = process.argv[2];

if (!serviceId) {
  console.error('Usage: npx tsx scripts/emergency-revoke.ts <serviceId>');
  console.error('Example: npx tsx scripts/emergency-revoke.ts room404-game-server');
  process.exit(1);
}

async function emergencyRevoke(): Promise<void> {
  console.log(`\n========================================`);
  console.log(`  EMERGENCY REVOCATION: ${serviceId}`);
  console.log(`========================================\n`);

  // Connect to Redis
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

  // Step 1: Get all token JTIs for this service
  const jtis = await redis.smembers(`verika:service-tokens:${serviceId}`);
  console.log(`Found ${jtis.length} active token(s) for ${serviceId}`);

  // Step 2: Revoke all tokens
  if (jtis.length > 0) {
    const pipeline = redis.pipeline();
    for (const jti of jtis) {
      pipeline.set(`verika:revoked:${jti}`, '1', 'EX', 900); // 15-min TTL
      console.log(`  Revoking token: ${jti}`);
    }
    await pipeline.exec();
    console.log(`\nRevoked ${jtis.length} token(s) in Redis`);
  }

  // Step 3: Update service status to 'revoked' in Firestore
  const db = new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID });
  await db.collection('service_registry').doc(serviceId).update({
    status: 'revoked',
  });
  console.log(`Service status set to 'revoked' in Firestore`);

  // Summary
  console.log(`\n========================================`);
  console.log(`  REVOCATION COMPLETE`);
  console.log(`  Service: ${serviceId}`);
  console.log(`  Tokens revoked: ${jtis.length}`);
  console.log(`  Registry status: revoked`);
  console.log(`========================================`);
  console.log(`\nThe service will:`);
  console.log(`  1. Detect revocation within 60 seconds (revocation monitor)`);
  console.log(`  2. Return 503 on new requests`);
  console.log(`  3. Drain in-flight requests (30s)`);
  console.log(`  4. Exit process (Cloud Run will NOT restart a revoked service)`);
  console.log(`\nTo restore: manually set status back to 'active' in Firestore.`);

  await redis.quit();
}

emergencyRevoke().catch((err) => {
  console.error('Emergency revocation failed:', err);
  process.exit(1);
});
