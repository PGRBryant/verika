# Verika

**The truth of what a service fundamentally is.**

Verika combines *Veritas* (truth) and *Ka* (the Egyptian concept of essence) — an identity and service mesh that solves five problems for internal service ecosystems:

1. **Prove identity** — every service gets a short-lived, KMS-signed JWT
2. **Enforce permissions** — capability-based access control, defined as code
3. **Discover services** — registry-based service discovery, no hardcoded URLs
4. **Audit everything** — structured logs on every cross-service interaction
5. **Revoke instantly** — emergency revocation propagates in under 60 seconds

Nothing more. Verika is infrastructure, not a product.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Verika API                                │
│                    (Cloud Run, min 2)                             │
│                                                                  │
│  POST /v1/tokens/service    ← GCP Workload Identity bootstrap    │
│  POST /v1/tokens/human      ← Google OAuth exchange              │
│  POST /v1/tokens/revoke     ← Emergency revocation               │
│  GET  /v1/services/:id      ← Registry lookup                    │
│  GET  /v1/jwks              ← Public keys (local validation)     │
│  GET  /health               ← Deep health check                  │
│                                                                  │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐                      │
│  │Firestore│  │Cloud KMS │  │Memorystore │                       │
│  │Registry │  │HSM Signs │  │(Redis)     │                       │
│  │5 records│  │RS256 JWT │  │Revocation  │                       │
│  └─────────┘  └──────────┘  └────────────┘                      │
└──────────────────────────────────────────────────────────────────┘
        ▲               ▲               ▲
        │               │               │
   ┌────┴────┐   ┌──────┴──────┐   ┌────┴────┐
   │MystWeaver│   │Room 404    │   │Varunai  │
   │Feature   │   │Game Server │   │Obs Hub  │
   │Flags     │   │+ AI Service│   │(planned)│
   └──────────┘   └────────────┘   └─────────┘

   Each service runs @internal/verika SDK:
   ┌──────────────────────────────────────┐
   │  TokenCache     → auto-refresh       │
   │  JWKSCache      → local validation   │
   │  RevocationMon  → 60s status poll    │
   │  GracefulShutdown → drain + exit     │
   └──────────────────────────────────────┘
```

## Key Design Decisions

**Token validation never calls the Verika API.** Recipients verify JWT signatures locally against cached JWKS and check revocation via Redis. Verika is never in the hot path.

**Policies are code.** They live in `policies/`, are reviewed in PRs, and represent the living documentation of what the ecosystem is allowed to do.

**V1 / V2 is the design, not a compromise.** V1 runs cleanly for 3-5 services. V2 is planned honestly with `TODO(verika-v2)` comments that include trigger conditions, migration guides, and effort estimates. A principal engineer reading this codebase should see both.

## Quick Start

### 1. Install the SDK

```bash
npm install @internal/verika
```

### 2. Initialize in Your Service

```typescript
import { VerikaClient } from '@internal/verika';

const verika = new VerikaClient({
  service: 'your-service-name',
  verikaEndpoint: process.env.VERIKA_ENDPOINT,
});

// Must complete before serving traffic
await verika.ready();
```

### 3. Make Authenticated Calls

```typescript
// Outbound — attach your service token
const response = await fetch(await verika.serviceUrl('target-service'), {
  headers: { Authorization: `Bearer ${verika.serviceToken()}` },
});

// Inbound — validate caller identity
const identity = await verika.validateServiceToken(token);
if (identity.capabilities.includes('flag.evaluate')) {
  // Caller is authorized
}
```

### 4. Fastify Plugin (Optional)

```typescript
import { verikaPlugin } from '@internal/verika/fastify';

app.register(verikaPlugin, { verika: verikaInstance });

// Per-route capability guard
app.post('/evaluate', {
  preHandler: [app.requireCapability('flag.evaluate')],
}, handler);

// Opt out for public routes
app.get('/health', { config: { verika: false } }, handler);
```

## Project Structure

```
verika/
├── packages/
│   ├── shared/          # Types, interfaces, error codes, capabilities
│   └── sdk/             # @internal/verika — the primary artifact
│       ├── client.ts        # VerikaClient
│       ├── token-cache.ts   # Auto-refresh with backoff
│       ├── jwks-cache.ts    # Local signature verification
│       ├── revocation.ts    # Redis revocation checks
│       ├── fastify.ts       # Fastify plugin with audit logging
│       └── ws-reauth.ts     # WebSocket re-auth protocol (client)
├── verika-api/          # Cloud Run API service
│   ├── src/routes/          # Token, service, JWKS, health endpoints
│   ├── src/services/        # Registry, token signing, revocation
│   └── Dockerfile
├── policies/            # Capability policies (code, reviewed in PRs)
├── infra/terraform/     # Complete GCP infrastructure
├── scripts/             # Seed registry, validate, emergency revoke
├── examples/            # Integration patterns for consuming services
└── docs/                # V2 migration guides (substantive, not placeholders)
```

## Registered Services

| Service | Project | Role |
|---------|---------|------|
| mystweaver-api | mystweaver-489920 | Feature flags & experimentation |
| room404-game-server | room404-prod | Multiplayer game server |
| room404-ai-service | room404-prod | AI content generation |
| varunai | varunai-prod | Observability hub (planned) |
| verika | verika-prod | Identity service (self-registered) |

## Emergency Revocation

If a service is compromised, revoke all its tokens immediately:

```bash
npx tsx scripts/emergency-revoke.ts room404-game-server
```

The service will detect revocation within 60 seconds, drain in-flight requests, and exit.

## V2 Roadmap

V2 is designed but not built. Each upgrade has a trigger condition and a migration guide:

| Feature | Trigger | Guide | Effort |
|---------|---------|-------|--------|
| Cloud Spanner | >10 services | [v2-spanner-migration.md](docs/v2-spanner-migration.md) | 1 week |
| Mutual TLS | >6 services or security review | [v2-mtls.md](docs/v2-mtls.md) | 2-3 weeks |
| WS Re-auth | Revoked token persists via WS | [v2-ws-reauth.md](docs/v2-ws-reauth.md) | 3 days |
| Per-operation tokens | Audit shows need | [v2-per-operation-tokens.md](docs/v2-per-operation-tokens.md) | 1 week |
| Human identity | 4+ human-facing services | [v2-human-identity.md](docs/v2-human-identity.md) | 3-4 weeks |
| Anomaly detection | After a real incident | [v2-anomaly-detection.md](docs/v2-anomaly-detection.md) | 4-6 weeks |
| Dedicated Redis | >10k revocation entries | [v2-dedicated-redis.md](docs/v2-dedicated-redis.md) | 2 days |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to register services, add capabilities, and handle emergency revocations.

## License

[MIT](LICENSE)
