# V2: WebSocket Continuous Re-authentication

## Trigger Condition

Implement when:

- An incident occurs where a revoked token persists via an existing WebSocket connection
- The security review identifies long-lived WebSocket connections as a gap in the revocation model

## Current V1 State

- **Protocol**: Fully defined — `REAUTH_REQUIRED`, `REAUTH`, `REAUTH_ACK` message types exist in `packages/shared/src/identity.ts`
- **Client side**: Implemented in SDK — `verika.createWsReauthHandler()` handles incoming `REAUTH_REQUIRED` messages, fetches fresh tokens, and sends `REAUTH` responses
- **Server side**: **NOT implemented** — this is the missing piece

The protocol and client handler are production-ready. The only missing component is the server-side timer in Room 404's WebSocket handler.

## Migration Steps

### 1. Add Server-Side Timer (Room 404 WS Handler)

In `apps/server/src/ws/handler.ts`:

```typescript
import { VerikaClient } from '@internal/verika';

// On WebSocket connection established:
const reauthInterval = setInterval(async () => {
  // Check token against revocation list
  try {
    await verika.validateServiceToken(connectionToken);
  } catch (err) {
    // Token revoked or expired — request re-auth
    ws.send(JSON.stringify({
      type: 'REAUTH_REQUIRED',
      deadline: Date.now() + 30_000, // 30 seconds to re-auth
    }));
    return;
  }

  // Check if token is within 3 minutes of expiry
  const tokenExp = decodeTokenExp(connectionToken);
  if (tokenExp - Date.now() / 1000 < 180) {
    ws.send(JSON.stringify({
      type: 'REAUTH_REQUIRED',
      deadline: Date.now() + 30_000,
    }));
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Handle REAUTH response from client
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'REAUTH') {
    const identity = await verika.validateServiceToken(msg.token);
    connectionToken = msg.token; // Update stored token
    ws.send(JSON.stringify({ type: 'REAUTH_ACK' }));
  }
});

// Clean up on disconnect
ws.on('close', () => clearInterval(reauthInterval));
```

### 2. Test the Flow

1. Connect a WebSocket client with a valid token
2. Revoke the token via Verika API
3. Wait for the 5-minute check interval
4. Verify `REAUTH_REQUIRED` is sent
5. Verify client responds with `REAUTH` containing a fresh token
6. Verify `REAUTH_ACK` is sent back
7. Verify connection continues normally

### 3. Handle Re-auth Failure

If the client doesn't respond to `REAUTH_REQUIRED` before the deadline:
- Log the failure
- Close the WebSocket connection with code 4001 (auth expired)

## Rollback Plan

Remove the `setInterval` from the WS handler. Client-side handler remains in the SDK (no-op without server-side trigger). Zero impact on existing functionality.

## Estimated Effort

**3 days** — the protocol is defined, the client is implemented. This is a single `setInterval` + message handler in one file.

## Impact

- **SDK**: None — client side already implemented
- **Room 404**: One file change in `apps/server/src/ws/handler.ts`
- **Shared types**: None — message types already defined
- **Other services**: None
