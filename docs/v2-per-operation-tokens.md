# V2: Per-Operation Tokens for Destructive Operations

## Trigger Condition

Implement when:

- Audit log shows a pattern of high-value operations needing finer revocation granularity
- A security incident involves a compromised service token being used for destructive operations during the 15-minute token TTL window

## Current V1 State

- **Token model**: Single 15-minute service token covers all operations
- **Granularity**: A service with `flag.write` capability can exercise it for the full token lifetime
- **Revocation**: Token-level only — revoking a token revokes all capabilities at once

V1's model is correct for the current service count and risk profile. Per-operation tokens add complexity that isn't justified until the audit log shows concrete need.

## Migration Steps

### 1. New Endpoint

Add `POST /v1/tokens/operation` to Verika API:

```typescript
// Request
{ serviceId: string, operation: string }

// Response
{ token: string, expiresAt: number } // 60-second TTL
```

The operation token is a short-lived JWT scoped to exactly one operation:

```json
{
  "iss": "verika",
  "sub": "varunai",
  "op": "flag.write",
  "iat": 1710000000,
  "exp": 1710000060,
  "jti": "optok_abc123"
}
```

### 2. SDK Method

Add `verika.operationToken(operation: string): Promise<string>`:

```typescript
// Usage
const opToken = await verika.operationToken('flag.write');
await fetch(mystweaverUrl + '/flags', {
  method: 'PUT',
  headers: { Authorization: `Bearer ${opToken}` },
});
```

### 3. Apply to High-Value Operations

Operations requiring per-operation tokens:
- `flag.write` — modifying feature flags
- `session.delete` — terminating game sessions
- `service.revoke` — revoking service identity (emergency)

### 4. Policy Engine Update

Extend `ServicePolicy.canCall` to support per-operation rate limits:

```typescript
canCall: [{
  service: 'mystweaver-api',
  capabilities: ['flag.write'],
  requireOperationToken: true, // V2
  rateLimit: { requests: 10, window: '1m' },
}]
```

## Rollback Plan

Remove the `requireOperationToken` flag from policies. Standard service tokens continue to work for all operations. The `/v1/tokens/operation` endpoint can remain deployed (unused).

## Estimated Effort

**1 week** — new endpoint, SDK method, policy engine update, and integration testing.

## Impact

- **API**: New endpoint
- **SDK**: New method `operationToken()`
- **Policies**: New `requireOperationToken` field
- **Consuming services**: Must call `verika.operationToken()` before destructive operations
