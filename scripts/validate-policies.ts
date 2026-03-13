/**
 * Policy validation script.
 * Validates all policy files in policies/ directory against the ServicePolicy interface
 * and cross-references with the seed registry data.
 *
 * Usage: npx tsx scripts/validate-policies.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface ServicePolicy {
  service: string;
  tokenTTL: { standard: number; elevated?: number };
  canCall: {
    service: string;
    capabilities: string[];
    rateLimit: { requests: number; window: string };
  }[];
  humanRoles?: {
    [role: string]: { canPerform: string[]; extends?: string };
  };
}

// Known services from seed data
const KNOWN_SERVICES = new Set([
  'mystweaver-api',
  'room404-game-server',
  'room404-ai-service',
  'varunai',
  'verika',
]);

// Known capabilities granted by each service (from seed data)
const GRANTED_CAPABILITIES: Record<string, string[]> = {
  'mystweaver-api': [
    'flag.evaluate', 'flag.evaluate.bulk', 'flag.write',
    'events.track', 'experiments.read', 'audit.read',
    'metrics.read', 'stream.subscribe',
  ],
  'room404-game-server': ['session.read', 'session.manage'],
  'room404-ai-service': [
    'content.generate.flavor', 'content.generate.chaos',
    'content.judge', 'content.generate.icon',
  ],
  'varunai': [],
  'verika': [
    'identity.token.issue', 'identity.token.validate',
    'identity.token.revoke', 'registry.read', 'registry.write',
  ],
};

let errors = 0;
let warnings = 0;

function error(msg: string): void {
  console.error(`  ERROR: ${msg}`);
  errors++;
}

function warn(msg: string): void {
  console.warn(`  WARN: ${msg}`);
  warnings++;
}

async function validatePolicy(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  console.log(`\nValidating ${fileName}...`);

  const module = (await import(filePath)) as { policy?: ServicePolicy };
  const policy = module.policy;

  if (!policy) {
    error('No `policy` export found');
    return;
  }

  // Validate required fields
  if (!policy.service) error('Missing `service` field');
  if (!policy.tokenTTL) error('Missing `tokenTTL` field');
  if (typeof policy.tokenTTL?.standard !== 'number') error('tokenTTL.standard must be a number');
  if (policy.tokenTTL?.standard !== 900) warn(`tokenTTL.standard is ${policy.tokenTTL.standard}, expected 900`);
  if (!Array.isArray(policy.canCall)) error('`canCall` must be an array');

  // Validate service name matches filename
  const expectedService = fileName.replace('.policy.ts', '');
  if (policy.service !== expectedService) {
    error(`Service "${policy.service}" doesn't match filename "${expectedService}"`);
  }

  // Validate service exists in registry
  if (!KNOWN_SERVICES.has(policy.service)) {
    error(`Service "${policy.service}" not found in registry`);
  }

  // Validate canCall references
  for (const call of policy.canCall) {
    if (!KNOWN_SERVICES.has(call.service)) {
      error(`canCall references unknown service "${call.service}"`);
    }

    // Check that capabilities are actually granted by the target
    const targetCaps = GRANTED_CAPABILITIES[call.service] ?? [];
    for (const cap of call.capabilities) {
      if (!targetCaps.includes(cap)) {
        error(`Capability "${cap}" not granted by target "${call.service}"`);
      }
    }

    // Validate rate limit
    if (!call.rateLimit) error(`Missing rateLimit for call to ${call.service}`);
    if (typeof call.rateLimit?.requests !== 'number') error('rateLimit.requests must be a number');
    if (!call.rateLimit?.window) error('rateLimit.window is required');
  }

  console.log(`  OK`);
}

async function main(): Promise<void> {
  console.log('Verika Policy Validation');
  console.log('========================');

  const policiesDir = path.resolve(process.cwd(), 'policies');
  const files = fs.readdirSync(policiesDir).filter((f) => f.endsWith('.policy.ts'));

  if (files.length === 0) {
    console.error('No policy files found in policies/');
    process.exit(1);
  }

  for (const file of files) {
    await validatePolicy(path.join(policiesDir, file));
  }

  console.log(`\n========================`);
  console.log(`Files: ${files.length}, Errors: ${errors}, Warnings: ${warnings}`);

  if (errors > 0) {
    console.error('\nValidation FAILED');
    process.exit(1);
  }

  console.log('\nValidation PASSED');
}

main().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(1);
});
