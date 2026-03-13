import { type Logger } from 'pino';
import { initiateGracefulShutdown } from './graceful-shutdown.js';

const DEFAULT_CHECK_INTERVAL_MS = 60_000; // 60 seconds

export class RevocationMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly serviceId: string;
  private readonly verikaEndpoint: string;
  private readonly checkIntervalMs: number;
  private readonly logger: Logger;

  constructor(
    serviceId: string,
    verikaEndpoint: string,
    logger: Logger,
    checkIntervalMs?: number,
  ) {
    this.serviceId = serviceId;
    this.verikaEndpoint = verikaEndpoint;
    this.checkIntervalMs = checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.logger = logger.child({ component: 'revocation-monitor' });
  }

  /** Start background polling for revocation status. */
  start(getToken: () => string): void {
    this.logger.info(
      { intervalMs: this.checkIntervalMs },
      'Revocation monitor started',
    );

    this.timer = setInterval(() => void this.check(getToken), this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async check(getToken: () => string): Promise<void> {
    try {
      const token = getToken();
      const response = await fetch(
        `${this.verikaEndpoint}/v1/services/${this.serviceId}/status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        this.logger.warn(
          { status: response.status },
          'Revocation status check failed',
        );
        return;
      }

      const data = (await response.json()) as { status: string };

      if (data.status === 'revoked') {
        this.logger.error('Service identity revoked by Verika');
        this.stop();
        await initiateGracefulShutdown(this.logger);
      }
    } catch (err) {
      // On Verika unreachable: log warning, continue
      this.logger.warn({ err }, 'Verika unreachable during revocation check');
    }
  }
}
