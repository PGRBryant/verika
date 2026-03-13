# V2: Dedicated Redis Instance for Verika

## Trigger Condition

Migrate when **any** of these conditions are met:

- Revocation list exceeds 10,000 entries
- Operational coupling with room404 Redis becomes a concern (e.g., room404 Redis maintenance affects Verika revocation checks)
- Multi-project VPC peering becomes complex enough to warrant isolation

## Current V1 State

- **Instance**: Shared Memorystore (Redis) in room404-prod
- **Namespace**: All Verika keys use `verika:*` prefix to avoid collision with room404 data
- **Access**: Via VPC peering between verika-vpc and room404-vpc
- **Key patterns**:
  - `verika:revoked:{jti}` — token revocation status
  - `verika:service-tokens:{serviceId}` — set of all JTIs for a service

Sharing Redis is the correct V1 choice. The revocation list is small (proportional to active tokens × TTL), and namespace isolation prevents data collision.

## Migration Steps

### 1. Provision Dedicated Redis

```bash
gcloud redis instances create verika-revocation \
  --size=1 \
  --region=us-east1 \
  --network=verika-vpc \
  --redis-version=redis_7_0 \
  --tier=standard-ha
```

### 2. VPC Peering

Ensure VPC peering exists between verika-vpc and all consumer project VPCs:
- verika-vpc ↔ room404-vpc (already exists)
- verika-vpc ↔ mystweaver-vpc (add if MystWeaver needs direct revocation checks)
- verika-vpc ↔ varunai-vpc (add when Varunai is built)

### 3. Migrate Existing Data

```bash
# Export verika:* keys from room404 Redis
redis-cli -h room404-redis --scan --pattern 'verika:*' | \
  while read key; do
    redis-cli -h room404-redis DUMP "$key" | \
    redis-cli -h verika-redis RESTORE "$key" 0
  done
```

Note: Since all keys have TTL, migration can also be done by simply switching the connection string and letting old keys expire naturally.

### 4. Update Connection Config

Change `REDIS_HOST` and `REDIS_PORT` environment variables in:
- Verika API Cloud Run service
- All services using the SDK (via their environment config)

This is a **connection string change only**. No code changes required.

### 5. Verify and Decommission

- Monitor new Redis instance for 48 hours
- Verify revocation checks are working end-to-end
- Remove `verika:*` keys from room404 Redis
- Update Terraform to reflect new Redis resource ownership

## Rollback Plan

Revert `REDIS_HOST` and `REDIS_PORT` to point back to room404 Redis. Keys with TTL will have expired, but this is acceptable — tokens issued during the migration window will re-register on their next refresh.

## Estimated Effort

**2 days** — provision Redis, update connection strings, verify.

## Impact

- **SDK**: Configuration change only (new Redis host)
- **API**: Configuration change only
- **Terraform**: New `google_redis_instance` resource in verika-prod, remove VPC peering dependency on room404 for Redis
- **Cost**: ~$50/month for a basic HA Redis instance
