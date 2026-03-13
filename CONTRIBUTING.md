# Contributing to Verika

Verika is the identity and service mesh for our internal ecosystem. Changes to Verika affect every service in the ecosystem, so we review carefully.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/verika.git
cd verika

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Build all packages
npm run build

# Run tests
npm run test

# Typecheck
npm run typecheck
```

## How to Register a New Service

Registering a new service requires two files and one seed data update:

### 1. Create a Policy File

Create `policies/<service-name>.policy.ts`:

```typescript
import type { ServicePolicy } from '@internal/verika-shared';

export const policy: ServicePolicy = {
  service: 'your-service-name',
  tokenTTL: { standard: 900 },
  canCall: [
    {
      service: 'target-service',
      capabilities: ['capability.name'],
      rateLimit: { requests: 100, window: '1m' },
    },
  ],
};
```

### 2. Add to Seed Registry

Add your service to `scripts/seed-registry.ts` with complete `ServiceRegistration` data:
- `id`, `displayName`, `project`, `owner`
- `endpoints` (production, internal, health)
- `requiredCapabilities` — what your service needs from others
- `grantedCapabilities` — what your service exposes to others

### 3. Add IAM Binding

Add a cross-project invoker binding in `infra/terraform/iam.tf` so your service's SA can call Verika.

### 4. Validate

```bash
npm run policy:validate
npx tsx scripts/validate-registry-seed.ts
```

## How to Add a Capability

1. Define the capability constant in `packages/shared/src/capabilities.ts`
2. Add it to the appropriate domain group
3. Add the capability to the target service's `grantedCapabilities` in the seed data
4. Add the capability to the calling service's policy `canCall` section
5. Run `npm run policy:validate` to verify consistency

## Emergency Revocation Procedure

If a service is compromised, revoke all its tokens immediately:

```bash
npx tsx scripts/emergency-revoke.ts <serviceId>
```

This will:
1. Revoke all active tokens for the service in Redis
2. Set the service status to `revoked` in Firestore
3. The service will detect revocation within 60 seconds, drain, and exit

To restore after investigation:
- Manually set service status back to `active` in Firestore
- The service will obtain new tokens on next startup

## PR Checklist

- [ ] All TypeScript files pass `tsc --strict`
- [ ] Tests pass: `npm run test`
- [ ] Policies validate: `npm run policy:validate`
- [ ] **Capability grant changes require platform team review**
- [ ] V2 TODOs include: what it upgrades, trigger condition, docs reference, estimated effort
- [ ] No secrets in committed files

## Policy Change Reviews

PRs that modify files in `policies/` trigger automated analysis. The CI bot will:
- Comment with the specific capabilities being added or removed
- Label the PR with `policy-review-required` if grants are widened
- Require platform team approval before merge

## Code Style

- Strict TypeScript — no `any`, no type shortcuts
- Structured logging with pino
- Descriptive error codes from `VerikaErrorCode`
- TODO comments follow the format: `// TODO(verika-v2): <what> <trigger> <docs ref> <effort>`
