import { type Logger } from 'pino';

const DRAIN_TIMEOUT_MS = 30_000; // 30 seconds for in-flight requests

let isShuttingDown = false;

/**
 * Check if the service is in graceful shutdown mode.
 * Used by middleware to return 503 on new inbound requests.
 */
export function isInShutdown(): boolean {
  return isShuttingDown;
}

/**
 * Initiate graceful shutdown:
 * 1. Mark as shutting down (new inbound requests get 503)
 * 2. Wait 30s for in-flight requests to drain
 * 3. Exit process with code 1 (Cloud Run restarts with clean state)
 */
export async function initiateGracefulShutdown(logger: Logger): Promise<void> {
  if (isShuttingDown) return;

  isShuttingDown = true;
  logger.error('Initiating graceful shutdown — 503 on new requests, 30s drain');

  // Allow in-flight requests to complete
  await new Promise<void>((resolve) => {
    setTimeout(resolve, DRAIN_TIMEOUT_MS);
  });

  logger.error('Drain complete — exiting process');
  process.exit(1);
}
