# V2: Firestore → Cloud Spanner Migration

## Trigger Condition

Migrate when **any** of these conditions are met:

- Service count exceeds 10 registered services
- Multi-region deployment requires global strong consistency for security-critical revocations
- Firestore read latency on the `service_registry` collection exceeds acceptable thresholds under load

## Current V1 State

- **Storage**: Firestore collection `service_registry` in verika-prod
- **Records**: ~5 services (mystweaver-api, room404-game-server, room404-ai-service, varunai, verika)
- **Access pattern**: Low-frequency reads (service lookup, status checks), very-low-frequency writes (registration, status updates)
- **Interface**: `RegistryService` class in `verika-api/src/services/registry.ts`

Firestore is the correct choice for V1. At 5-10 records with single-region deployment, Spanner adds cost and operational complexity without benefit.

## Migration Steps

### 1. Provision Spanner Instance

```bash
gcloud spanner instances create verika-registry \
  --config=regional-us-east1 \
  --description="Verika Service Registry" \
  --processing-units=100
```

### 2. Create Schema

```sql
CREATE TABLE service_registry (
  id STRING(64) NOT NULL,
  display_name STRING(256) NOT NULL,
  project STRING(128) NOT NULL,
  owner STRING(256) NOT NULL,
  status STRING(16) NOT NULL,
  endpoints JSON NOT NULL,
  required_capabilities ARRAY<STRING(128)>,
  granted_capabilities JSON NOT NULL,
  runbook STRING(512),
  oncall STRING(256),
  version STRING(32) NOT NULL,
  registered_at INT64 NOT NULL,
  last_seen_at INT64 NOT NULL,
) PRIMARY KEY (id);
```

### 3. Export and Import

```bash
# Export from Firestore
gcloud firestore export gs://verika-backup/registry-export

# Transform and import to Spanner (custom script)
npx tsx scripts/migrate-firestore-to-spanner.ts
```

### 4. Update Connection Config

Replace the Firestore client in `RegistryService` with a Spanner client. The interface (`getService`, `getAllServices`, `updateLastSeen`, etc.) does not change. No SDK changes required.

### 5. Parallel Read Phase

Run both Firestore and Spanner in parallel for 48 hours. Compare results. Log discrepancies.

### 6. Cut Over

Switch `RegistryService` to Spanner-only. Remove Firestore dependency.

### 7. Decommission

Delete the Firestore `service_registry` collection after 30 days of successful Spanner operation.

## Rollback Plan

Revert the `RegistryService` implementation to use Firestore. Data is unchanged during the parallel read phase. If cut over has occurred, restore from the Firestore export in GCS.

## Estimated Effort

**1 week** — includes Spanner provisioning, schema creation, migration script, parallel read validation, and cut over.

## Impact

- **SDK**: None — SDK calls Verika API, not the database directly
- **API**: Internal implementation change only — same endpoints, same responses
- **Terraform**: Add Spanner resources, remove Firestore resources
- **Cost**: Spanner minimum is ~$65/month for 100 processing units vs. Firestore's pay-per-read pricing
