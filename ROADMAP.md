# Verika Roadmap

This roadmap tracks the phased rollout of Verika across the ecosystem. V1 is the current sprint. V2 features are designed and documented but not implemented — each has a trigger condition that determines when it's warranted.

---

## Phase 0 — Preparation (Current)

**Goal**: Zero behavior changes. Prepare existing services for Verika integration.

- [ ] Add `VERIKA_ENDPOINT` and `VERIKA_SERVICE_ID` env vars to MystWeaver and Room 404 (set but unused)
- [ ] Add `@internal/verika` as optional dependency in MystWeaver and Room 404
- [ ] Add `TODO(verika)` comments at every auth decision point in existing services
- [ ] Add `identity` param option to `MystweaverClient` constructor (accepts `VerikaClient`, falls through to SDK key if absent)
- [ ] See: [examples/phase0-todo-comments.ts](examples/phase0-todo-comments.ts)

**Exit criteria**: All services compile with Verika env vars set. No behavior changes. No new dependencies in the hot path.

---

## Phase 1 — Verika Live, Observation Mode

**Goal**: Verika API running in production with correct security foundations. SDK imported and instantiated. Logging what it *would* do without enforcing anything.

### Core deployment
- [ ] Deploy Verika API to Cloud Run (`verika-prod` project)
- [ ] Provision GCP infrastructure via Terraform (KMS, Firestore, VPC peering)
- [ ] Seed service registry with all 5 services
- [ ] Run `verika.ready()` in each service at startup
- [ ] SDK logs authentication decisions but does **not** enforce them
- [ ] Verify audit log populates correctly
- [ ] Monitor health endpoint and alerting

### Security foundations (must ship with Phase 1)
- [x] **Fix SDK identity bootstrap**: `VerikaClient.fetchServiceToken()` attaches a GCP identity token via metadata server. GCP auth validates audience matches `VERIKA_SELF_URL`.
- [x] **Add `aud` claim to service tokens**: Tokens include `targetService` as audience. SDK verifies `aud` matches `this.options.service`. Token route requires `targetService` in body and validates it exists in registry.
- [x] **Add runtime input validation**: All POST routes have JSON Schema validation (Fastify native AJV) with type, length, pattern, and `additionalProperties: false` constraints.
- [x] **Remove dead capability constants**: Removed `HERALD_NOTIFY` / `HeraldCapabilities` (no service, no phase plan). Remaining capabilities all have enforcement paths in Phase 2-4.

**Exit criteria**: Verika API is live, all services are registered, audit log is streaming, zero impact on existing traffic. Identity bootstrap is cryptographically sound. Tokens are audience-restricted. All API inputs are validated at runtime.

---

## Phase 2 — Internal Service-to-Service

**Goal**: All internal service-to-service calls use Verika tokens. External callers (SDK keys) unaffected. Policies are enforced, not just documented.

### Service integration
- [ ] Room 404 Game Server → AI Service: Verika tokens on all outbound calls
- [ ] Room 404 Game Server → MystWeaver: Verika tokens via `MystweaverClient({ identity: verika })`
- [ ] MystWeaver API validates Verika tokens on SDK routes (two-path auth: JWT + SDK key)
- [ ] MystWeaver `/metrics` accepts Verika tokens with `metrics.read` capability
- [ ] MystWeaver SSE `/sdk/stream` accepts Verika tokens with `stream.subscribe` capability
- [ ] Audit log enrichment: `callerService`, `callerVersion`, `verikaTokenId`, `traceId`
- [ ] Existing SDK keys continue to work for external callers (unchanged)
- [ ] Emergency revocation tested end-to-end

### Policy enforcement
- [x] **Load policy files at token issuance**: `PolicyService` compiles all policy data at build time into a runtime-queryable map. Token issuance calls `policy.resolveCapabilities()` to intersect caller's `canCall` with target's `grantedCapabilities`.
- [x] **Enforce `canCall` restrictions**: Token `caps` array is now the intersection of caller policy and target grants. Requests for unauthorized caller→target pairs are denied with 403.
- [x] **Remove `rateLimit` from `ServicePolicy` type**: Removed from type, all 5 policy files, `validate-policies.ts`, and `CONTRIBUTING.md`.
- [x] **Define revocation behavior under Redis failure**: `RevocationChecker` tracks `failOpenCount`, `checkCount`, `lastFailOpenAt` with structured log on every fail-open event (including running rate). Services opt into fail-closed via `revocationFailMode: 'closed'` in `VerikaClientOptions`. New error code `VERIKA_REVOCATION_UNAVAILABLE`.

**Exit criteria**: All internal calls authenticated via Verika. External SDK key flow unchanged. Emergency revocation verified. Policy files are the source of truth at runtime, not just documentation. Revocation failure is observable.

---

## Phase 3 — Presenter Human Auth

**Goal**: Unified presenter identity across Room 404 and Varunai, with proper authorization gates on human token issuance.

### Core flow
- [ ] Presenter flow: Google OAuth → `verika.exchangeGoogleToken()` → Verika human token
- [ ] Room 404 `/present` route uses Verika human token with `room404.presenter` role
- [ ] Presenter WS messages validated via `verika.validateHumanToken()`
- [ ] MystWeaver admin retains Google IAP (unchanged — correct for V1)
- [ ] Human tokens stored in sessionStorage (client-side)
- [ ] 60-minute sliding window TTL on activity

### Human token endpoint hardening
- [ ] **Add authorization to `POST /v1/tokens/human`**: Currently any valid Google account gets all presenter roles. Add: (1) allowed-email-domain or allowed-email-list check, (2) role assignment from policy (not the hardcoded `PRESENTER_ROLES` constant), (3) rate limiting on the endpoint.
- [ ] **Add `aud` claim to human tokens**: Same rationale as service tokens — a human token for Room 404 should not be accepted by MystWeaver admin routes.
- [ ] **Revocation check for human tokens**: `validateHumanToken()` in the SDK does not check Redis revocation today. It must, using the same path as service token validation.

**Exit criteria**: Presenter opens Room 404 and Varunai with a single Verika human token. MystWeaver admin unchanged. Human tokens are only issued to authorized users with policy-driven roles. Human tokens are audience-restricted and revocable.

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
- **Note**: The client-side WS re-auth protocol (`ws-reauth.ts`, `REAUTH_REQUIRED/REAUTH/REAUTH_ACK` types) is already scaffolded in the SDK. Do not build the server side until the trigger condition is met. The client code should be reviewed for bit-rot when this is picked up.

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

### V2.8 — Token Binding / Proof-of-Possession
- **Trigger**: Security review identifies bearer token replay as a priority risk, or mTLS (V2.5) is deployed and cert-bound tokens become feasible
- **Effort**: 1-2 weeks
- **Description**: Bind tokens to the caller's identity proof (DPoP for HTTP, or mTLS certificate thumbprint via `cnf` claim) so intercepted tokens cannot be replayed by a different caller. Currently all tokens are pure bearer — anyone holding the token string can use it. At 15-minute TTL this is acceptable, but proof-of-possession eliminates the replay window entirely.

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
  -d '{"serviceId": "room404-game-server", "targetService": "mystweaver-api"}'
```

### 5. Run Phase 0 in Existing Services

See [examples/phase0-todo-comments.ts](examples/phase0-todo-comments.ts) for the exact pattern.

### 6. Emergency Full Revocation (verify it works)

```bash
npx tsx scripts/emergency-revoke.ts mystweaver-api
# Then restore: set status back to 'active' in Firestore
```
