# Verika Roadmap

This roadmap tracks the phased rollout of Verika across the ecosystem. V1 is the current sprint. V2 features are designed and documented but not implemented — each has a trigger condition that determines when it's warranted.

---

## Phase 0 — Preparation (Current)

**Goal**: Zero behavior changes. Prepare existing services for Verika integration.

- [ ] Add `VERIKA_ENDPOINT` and `VERIKA_SERVICE_ID` env vars to MystWeaver and Room 404 (set but unused)
- [ ] Add `@internal/verika` as optional dependency in MystWeaver and Room 404
- [ ] Add `TODO(verika)` comments at every auth decision point in existing services
- [ ] Add WS reauth message types (`REAUTH_REQUIRED`, `REAUTH`, `REAUTH_ACK`) to Room 404 shared types
- [ ] Add `identity` param option to `MystweaverClient` constructor (accepts `VerikaClient`, falls through to SDK key if absent)
- [ ] See: [examples/phase0-todo-comments.ts](examples/phase0-todo-comments.ts)

**Exit criteria**: All services compile with Verika env vars set. No behavior changes. No new dependencies in the hot path.

---

## Phase 1 — Verika Live, Observation Mode

**Goal**: Verika API running in production. SDK imported and instantiated. Logging what it *would* do without enforcing anything.

- [ ] Deploy Verika API to Cloud Run (`verika-prod` project)
- [ ] Provision GCP infrastructure via Terraform (KMS, Firestore, VPC peering)
- [ ] Seed service registry with all 5 services
- [ ] Run `verika.ready()` in each service at startup
- [ ] SDK logs authentication decisions but does **not** enforce them
- [ ] Verify audit log populates correctly
- [ ] Monitor health endpoint and alerting

**Exit criteria**: Verika API is live, all services are registered, audit log is streaming, zero impact on existing traffic.

---

## Phase 2 — Internal Service-to-Service

**Goal**: All internal service-to-service calls use Verika tokens. External callers (SDK keys) unaffected.

- [ ] Room 404 Game Server → AI Service: Verika tokens on all outbound calls
- [ ] Room 404 Game Server → MystWeaver: Verika tokens via `MystweaverClient({ identity: verika })`
- [ ] MystWeaver API validates Verika tokens on SDK routes (two-path auth: JWT + SDK key)
- [ ] MystWeaver `/metrics` accepts Verika tokens with `metrics.read` capability
- [ ] MystWeaver SSE `/sdk/stream` accepts Verika tokens with `stream.subscribe` capability
- [ ] Audit log enrichment: `callerService`, `callerVersion`, `verikaTokenId`, `traceId`
- [ ] Existing SDK keys continue to work for external callers (unchanged)
- [ ] Emergency revocation tested end-to-end

**Exit criteria**: All internal calls authenticated via Verika. External SDK key flow unchanged. Emergency revocation verified.

---

## Phase 3 — Presenter Human Auth

**Goal**: Unified presenter identity across Room 404 and Varunai.

- [ ] Presenter flow: Google OAuth → `verika.exchangeGoogleToken()` → Verika human token
- [ ] Room 404 `/present` route uses Verika human token with `room404.presenter` role
- [ ] Presenter WS messages validated via `verika.validateHumanToken()`
- [ ] MystWeaver admin retains Google IAP (unchanged — correct for V1)
- [ ] Human tokens stored in sessionStorage (client-side)
- [ ] 60-minute sliding window TTL on activity

**Exit criteria**: Presenter opens Room 404 and Varunai with a single Verika human token. MystWeaver admin unchanged.

---

## Phase 4 — Varunai Registration

**Goal**: Varunai fully registered and ready to build against Verika.

- [ ] Varunai registered in Verika registry (already seeded)
- [ ] `flag.write` capability granted to Varunai in MystWeaver policy
- [ ] IAM binding active: `varunai@varunai-prod` → Verika Cloud Run invoker
- [ ] Varunai can begin development against live Verika instance
- [ ] Varunai scrapes MystWeaver `/metrics` with Verika token
- [ ] Varunai subscribes to MystWeaver SSE with Verika token
- [ ] Varunai reads Room 404 session state with `session.read` capability

**Exit criteria**: Varunai team can build and test against a real Verika instance. All required capabilities are granted and verified.

---

## V2 Features — Designed, Not Scheduled

These features are triggered by specific conditions, not calendar dates. Each has a substantive migration guide in `docs/`.

### V2.1 — Dedicated Redis
- **Trigger**: Revocation list > 10k entries or operational coupling with room404 Redis
- **Effort**: 2 days
- **Guide**: [docs/v2-dedicated-redis.md](docs/v2-dedicated-redis.md)

### V2.2 — WebSocket Continuous Re-auth (Server Side)
- **Trigger**: Incident where revoked token persists via existing WebSocket
- **Effort**: 3 days
- **Guide**: [docs/v2-ws-reauth.md](docs/v2-ws-reauth.md)

### V2.3 — Per-Operation Tokens
- **Trigger**: Audit log shows need for finer revocation granularity on destructive operations
- **Effort**: 1 week
- **Guide**: [docs/v2-per-operation-tokens.md](docs/v2-per-operation-tokens.md)

### V2.4 — Cloud Spanner Migration
- **Trigger**: Service count > 10 or multi-region deployment
- **Effort**: 1 week
- **Guide**: [docs/v2-spanner-migration.md](docs/v2-spanner-migration.md)

### V2.5 — Mutual TLS
- **Trigger**: Service count > 6 or security review priority
- **Effort**: 2-3 weeks
- **Guide**: [docs/v2-mtls.md](docs/v2-mtls.md)

### V2.6 — Full Human Identity Unification
- **Trigger**: 4+ human-facing services need unified identity
- **Effort**: 3-4 weeks
- **Guide**: [docs/v2-human-identity.md](docs/v2-human-identity.md)

### V2.7 — Behavioral Anomaly Detection
- **Trigger**: Real incident that behavioral detection would have caught
- **Effort**: 4-6 weeks
- **Guide**: [docs/v2-anomaly-detection.md](docs/v2-anomaly-detection.md)

---

## What to Do Next

After scaffolding, the exact steps to get Verika running:

### 1. Deploy Infrastructure

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

### 2. Seed the Registry

```bash
npx tsx scripts/seed-registry.ts
```

### 3. Build and Deploy

```bash
# Build Docker image
docker build -t verika-api -f verika-api/Dockerfile .

# Push to Artifact Registry
docker tag verika-api us-east1-docker.pkg.dev/verika-prod/verika-images/verika-api:latest
docker push us-east1-docker.pkg.dev/verika-prod/verika-images/verika-api:latest

# Deploy to Cloud Run
gcloud run deploy verika-api \
  --image us-east1-docker.pkg.dev/verika-prod/verika-images/verika-api:latest \
  --region us-east1 \
  --platform managed
```

### 4. Verify Token Issuance

```bash
# Get a GCP identity token
TOKEN=$(gcloud auth print-identity-token)

# Request a service token
curl -X POST https://verika-api-*.run.app/v1/tokens/service \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serviceId": "mystweaver-api"}'
```

### 5. Run Phase 0 in Existing Services

See [examples/phase0-todo-comments.ts](examples/phase0-todo-comments.ts) for the exact pattern.

### 6. Emergency Full Revocation (verify it works)

```bash
npx tsx scripts/emergency-revoke.ts mystweaver-api
# Then restore: set status back to 'active' in Firestore
```
