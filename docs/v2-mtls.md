# V2: Mutual TLS for Service-to-Service Communication

## Trigger Condition

Implement when **any** of these conditions are met:

- Service count exceeds 6
- Security review identifies transport-layer verification as a priority
- Compliance requirements mandate mutual authentication at the transport layer

## Current V1 State

- **Auth**: JWT bearer tokens over HTTPS
- **Transport**: TLS (GCP-managed) — encrypted, but no mutual certificate verification
- **SDK interface**: `VerikaClientOptions.mtls` is defined (`{ enabled: boolean, certTTL?: number }`) but `enabled` is always `false` in V1
- **HTTP client**: `verika.createHttpClient()` is referenced in code but not yet implemented

V1's JWT-over-HTTPS is appropriate for 3-5 services in a trusted GCP environment. mTLS adds defense-in-depth when the service mesh grows or when a security review raises transport-layer concerns.

## Migration Steps

### 1. Set Up Certificate Authority Service

```bash
gcloud privateca pools create verika-ca-pool \
  --location=us-east1 \
  --tier=devops

gcloud privateca roots create verika-root-ca \
  --pool=verika-ca-pool \
  --location=us-east1 \
  --subject="CN=Verika Root CA,O=Internal"
```

### 2. Implement Certificate Issuance in Verika API

Add endpoint: `POST /v1/certs/issue`
- Input: CSR (Certificate Signing Request) from SDK
- Output: Signed client certificate
- Certificate TTL: 24 hours
- Bound to service identity (serviceId in certificate SAN)

### 3. Implement `verika.createHttpClient()`

Currently a no-op stub. Full implementation:
- Generate key pair at startup during `verika.ready()`
- Create CSR and request certificate from Verika CA
- Configure HTTP client with client certificate
- Rotate certificate 1 hour before expiry (23-hour refresh cycle)
- Fall back to JWT-only if cert issuance fails (log warning)

### 4. Add Client Cert Validation to verikaPlugin

In the Fastify plugin's `onRequest` hook:
- Extract client certificate from TLS connection
- Verify certificate chain against Verika CA
- Cross-reference certificate SAN with JWT `sub` claim
- Reject if certificate and JWT identity don't match

### 5. Roll Out Service by Service

- Enable mTLS on verika-api first (self-test)
- Then room404-game-server → room404-ai-service
- Then mystweaver-api
- Finally varunai (when built)

Each service: set `mtls.enabled: true` in VerikaClientOptions.

## Rollback Plan

Set `mtls.enabled: false` in each service's VerikaClientOptions. The SDK falls back to JWT-only auth. No service restart required — takes effect on next token refresh cycle.

## Estimated Effort

**2-3 weeks** — includes CA setup, SDK implementation, plugin validation, per-service rollout, and testing.

## Impact

- **SDK**: `createHttpClient()` implementation, cert rotation logic
- **API**: New `/v1/certs/issue` endpoint
- **Plugin**: Client cert validation in `onRequest` hook
- **Terraform**: Certificate Authority Service resources
- **Network**: No change — still HTTPS, now with mutual certs
