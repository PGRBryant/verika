# Verika Roadmap

This roadmap tracks the phased rollout of Verika across the ecosystem. V1 is the current sprint. V2 features are designed and documented but not implemented — each has a trigger condition that determines when it's warranted.

---

## Phase 0 — Preparation

**Status**: Complete.

**Goal**: Zero behavior changes. Prepare existing services for Verika integration.

- [x] Add `VERIKA_ENDPOINT` and `VERIKA_SERVICE_ID` env vars to MystWeaver and Room 404 (set but unused)
- [x] Add `@internal/verika` as optional dependency in MystWeaver and Room 404
- [x] Add `TODO(verika)` comments at every auth decision point in existing services
- [x] Add `identity` param option to `MystweaverClient` constructor (accepts `VerikaClient`, falls through to SDK key if absent)
- [ ] See: [examples/phase0-todo-comments.ts](examples/phase0-todo-comments.ts)

**Exit criteria**: All services compile with Verika env vars set. No behavior changes. No new dependencies in the hot path.

---

## Phase 1 — Verika Live, Observation Mode

**Status**: Complete.

**Goal**: Verika API running in production with correct security foundations. SDK imported and instantiated. Logging what it *would* do without enforcing anything.

### Core deployment (operational — requires live GCP infrastructure)
- [x] Deploy Verika API to Cloud Run (`verika-490105` project)
- [x] Provision GCP infrastructure via Terraform (KMS, Firestore, VPC connector) — Redis pending VPC peering with room404
- [x] Seed service registry with all 5 services
- [x] Run `verika.ready()` in each service at startup
- [x] SDK logs authentication decisions but does **not** enforce them
- [x] Verify audit log populates correctly
- [x] Monitor health endpoint and alerting (uptime check + email alerts configured)

### Security foundations (must ship with Phase 1)
- [x] **Fix SDK identity bootstrap**: `VerikaClient.fetchServiceToken()` attaches a GCP identity token via metadata server. GCP auth validates audience matches `VERIKA_SELF_URL`.
- [x] **Add `aud` claim to service tokens**: Tokens include `targetService` as audience. SDK verifies `aud` matches `this.options.service`. Token route requires `targetService` in body and validates it exists in registry.
- [x] **Add runtime input validation**: All POST routes have JSON Schema validation (Fastify native AJV) with type, length, pattern, and `additionalProperties: false` constraints.
- [x] **Remove dead capability constants**: Removed `HERALD_NOTIFY` / `HeraldCapabilities` (no service, no phase plan). Remaining capabilities all have enforcement paths in Phase 2-4.

**Exit criteria**: Verika API is live, all services are registered, audit log is streaming, zero impact on existing traffic. Identity bootstrap is cryptographically sound. Tokens are audience-restricted. All API inputs are validated at runtime.

---

## Phase 2 — Internal Service-to-Service

**Status**: Policy enforcement complete. Service integration pending (requires changes in Room 404 + MystWeaver repos).

**Goal**: All internal service-to-service calls use Verika tokens. External callers (SDK keys) unaffected. Policies are enforced, not just documented.

### Service integration (operational — requires changes in consuming services)
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

**Status**: Endpoint hardening complete. Core flow pending (requires Varunai client-side implementation).

**Goal**: Presenter authenticates via Verika with a single human token scoped to Varunai. Varunai proxies all downstream calls (Room 404 session data, MystWeaver flags, etc.) using its own service tokens. No human tokens are presented directly to Room 404 or MystWeaver.

### Architecture decision
The presenter's browser only talks to Varunai. Varunai validates the human token (`aud: 'varunai'`) and proxies downstream:
- Room 404 session data → Varunai service token with `session.read`
- MystWeaver flag writes → Varunai service token with `flag.write`
- MystWeaver metrics/SSE → Varunai service token with `metrics.read`, `stream.subscribe`

This means Room 404 and MystWeaver never need human token validation — they already accept Varunai's service tokens (Phase 2). The `extends: 'room404.presenter'` role in varunai's policy is used by Varunai internally to authorize presenter actions (e.g., "can this user view session data?").

### Core flow (requires Varunai client-side implementation)
- [ ] Presenter flow: Google OAuth → `verika.exchangeGoogleToken()` → Verika human token (`aud: 'varunai'`)
- [ ] Varunai validates human token via `verika.validateHumanToken(token, { requiredRole: 'varunai.presenter' })`
- [ ] Varunai proxies Room 404 session reads using its service token (`session.read` capability)
- [ ] Varunai proxies MystWeaver flag writes using its service token (`flag.write` capability)
- [ ] MystWeaver admin retains Google IAP (unchanged — correct for V1)
- [ ] Human tokens stored in sessionStorage (client-side)
- [ ] 60-minute sliding window TTL on activity

### Human token endpoint hardening
- [x] **Add authorization to `POST /v1/tokens/human`**: Email domain check via `VERIKA_ALLOWED_HUMAN_DOMAINS` env var. Role assignment from policy `humanRoles` (removed hardcoded `PRESENTER_ROLES`). Per-email rate limiting (10 req/min). Route now requires `targetService` in body.
- [x] **Add `aud` claim to human tokens**: Human tokens include `targetService` as audience. SDK verifies `aud` matches `this.options.service` in `validateHumanToken()`. `exchangeGoogleToken()` sends `targetService` automatically.
- [x] **Revocation check for human tokens**: `validateHumanToken()` in the SDK now checks Redis revocation using the same path as service token validation, including fail-open/fail-closed mode support.

**Exit criteria**: Presenter authenticates once via Google OAuth, gets a Verika human token scoped to Varunai. Varunai validates the token and proxies all downstream calls via service-to-service auth. MystWeaver admin unchanged. Human tokens are only issued to authorized users with policy-driven roles. Human tokens are audience-restricted and revocable.

---

## Phase 4 — Varunai Registration

**Status**: Pending — entirely operational (IAM bindings, registry seeding, live verification).

**Goal**: Varunai fully registered and ready to build against Verika.

- [ ] Varunai registered in Verika registry (already seeded)
- [ ] `flag.write` capability granted to Varunai in MystWeaver policy
- [ ] IAM binding active: `varunai-api@varunai-490119` → Verika Cloud Run invoker
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
docker tag verika-api us-east1-docker.pkg.dev/verika-490105/verika-images/verika-api:latest
docker push us-east1-docker.pkg.dev/verika-490105/verika-images/verika-api:latest

# Deploy to Cloud Run
gcloud run deploy verika-api \
  --image us-east1-docker.pkg.dev/verika-490105/verika-images/verika-api:latest \
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
