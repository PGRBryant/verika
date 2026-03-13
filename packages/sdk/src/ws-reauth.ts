import type { VerikaWsMessage } from '@internal/verika-shared';

interface WsReauthOptions {
  /** Called when server requests re-authentication. Should return a fresh token. */
  onReauthRequired: () => Promise<string>;
  /** Called when re-auth fails. */
  onReauthFailed?: (error: Error) => void;
}

/**
 * Creates a client-side WebSocket re-authentication handler.
 *
 * Protocol:
 *   Server → REAUTH_REQUIRED (with deadline)
 *   Client → REAUTH (with fresh token)
 *   Server → REAUTH_ACK (success)
 *
 * Usage:
 *   const handler = createWsReauthHandler({
 *     onReauthRequired: () => verika.serviceToken(), // or refresh
 *   });
 *
 *   ws.on('message', async (data) => {
 *     const msg = JSON.parse(data);
 *     const response = await handler(msg);
 *     if (response) ws.send(JSON.stringify(response));
 *   });
 */
export function createWsReauthHandler(
  options: WsReauthOptions,
): (message: VerikaWsMessage) => Promise<VerikaWsMessage | null> {
  return async (message: VerikaWsMessage): Promise<VerikaWsMessage | null> => {
    if (message.type === 'REAUTH_REQUIRED') {
      try {
        const token = await options.onReauthRequired();
        return { type: 'REAUTH', token };
      } catch (err) {
        options.onReauthFailed?.(err instanceof Error ? err : new Error(String(err)));
        return null;
      }
    }

    if (message.type === 'REAUTH_ACK') {
      // Re-auth succeeded — no response needed
      return null;
    }

    // Not a reauth message — pass through
    return null;
  };
}
