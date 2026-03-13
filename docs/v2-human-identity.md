# V2: Full Human Identity Unification

## Trigger Condition

Implement when:

- 4+ human-facing services need unified identity
- Google IAP becomes a friction point for the presenter flow
- New roles beyond "presenter" need cross-service identity

## Current V1 State

- **MystWeaver admin**: Google IAP — correct, not replaced in V1
- **Presenter flow**: Verika human token with roles `room404.presenter`, `mystweaver.viewer`, `varunai.presenter`
- **Human registry**: No persistent human registry — tokens are issued on-demand from Google OAuth exchange
- **Role management**: Hardcoded in Verika API (`PRESENTER_ROLES` constant)

V1's approach is correct: IAP for admin (robust, already configured), Verika human tokens for presenter (cross-service identity for demo flow). Full unification isn't warranted until there are enough human-facing services to justify the complexity.

## Migration Steps

### 1. Human Registry

Create a persistent human registry in Firestore (or Spanner if already migrated):

```typescript
interface HumanRegistration {
  userId: string;          // "user_abc123"
  email: string;
  displayName: string;
  roles: string[];
  status: 'active' | 'suspended';
  lastLoginAt: number;
  createdAt: number;
}
```

### 2. Role Management

Move from hardcoded roles to a role management system:
- Roles defined per-service in policy files (already structured this way)
- Role assignment stored in human registry
- Admin UI for role management (new)

### 3. Token Introspection Endpoint

Add `GET /v1/tokens/introspect`:
- Input: Verika human token
- Output: Full human identity with current roles
- Used by services that need real-time role checks

### 4. MystWeaver IAP Replacement

Replace Google IAP with Verika human auth for MystWeaver admin:
- Add login flow to MystWeaver admin UI
- Verika issues human token with `mystweaver.admin` role
- Remove IAP configuration from MystWeaver's Cloud Run service
- Add Verika human token validation to admin routes

### 5. Session Management

Implement server-side session tracking:
- Active sessions stored in Redis
- Session invalidation (logout from all devices)
- Sliding window TTL refresh on activity (already designed: 60-minute TTL)

### 6. Refresh Token Flow

Add refresh tokens for human sessions:
- Refresh token: 7-day TTL, stored in httpOnly cookie
- Access token: 60-minute TTL (current)
- Refresh endpoint: `POST /v1/tokens/human/refresh`

## Rollback Plan

Revert MystWeaver to IAP. Revert presenter flow to direct Google OAuth (if needed). Human registry data is retained.

## Estimated Effort

**3-4 weeks** — human registry, role management, token introspection, IAP replacement, session management, refresh flow.

## Impact

- **API**: New endpoints (introspect, refresh), human registry service
- **SDK**: `validateHumanToken()` gains role lookup from registry
- **MystWeaver**: IAP removal, Verika human auth integration
- **Terraform**: Remove IAP config, add human registry resources
- **All human-facing services**: Unified login flow
