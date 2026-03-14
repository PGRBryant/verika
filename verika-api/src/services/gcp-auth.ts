import { OAuth2Client } from 'google-auth-library';
import { pino, type Logger } from 'pino';
import type { VerikaApiConfig } from '../config.js';

const SA_EMAIL_PATTERN = /^(.+)@(.+)\.iam\.gserviceaccount\.com$/;

/** Maps service account email convention to service ID */
const SA_TO_SERVICE_MAP: Record<string, string> = {
  'mystweaver-api': 'mystweaver-api',
  'room404-game-server': 'room404-game-server',
  'room404-ai-service': 'room404-ai-service',
  'varunai-api': 'varunai',
  'verika-api': 'verika',
};

export interface GcpIdentity {
  email: string;
  serviceId: string;
  project: string;
}

export class GcpAuthService {
  private readonly oauthClient: OAuth2Client;
  private readonly logger: Logger;
  private readonly expectedAudience: string;
  private readonly googleOAuthClientId: string;

  constructor(config: VerikaApiConfig) {
    this.oauthClient = new OAuth2Client();
    this.logger = pino({ name: 'gcp-auth-service' });
    this.expectedAudience = config.selfUrl;
    this.googleOAuthClientId = config.googleOAuthClientId;
  }

  /**
   * Validates a GCP identity token from the Authorization header.
   * Returns the service account email and mapped service ID.
   */
  async validateGcpIdentity(authHeader: string | undefined): Promise<GcpIdentity> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new GcpAuthError('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: token,
        audience: this.expectedAudience,
      });

      const payload = ticket.getPayload();
      if (!payload?.email) {
        throw new GcpAuthError('Token payload missing email');
      }

      const match = SA_EMAIL_PATTERN.exec(payload.email);
      if (!match) {
        throw new GcpAuthError(`Not a service account email: ${payload.email}`);
      }

      const saName = match[1];
      const project = match[2];
      const serviceId = SA_TO_SERVICE_MAP[saName];

      if (!serviceId) {
        this.logger.warn({ email: payload.email }, 'Unknown service account');
        throw new GcpAuthError(`Unknown service account: ${payload.email}`);
      }

      return { email: payload.email, serviceId, project };
    } catch (err) {
      if (err instanceof GcpAuthError) throw err;
      this.logger.error({ err }, 'GCP identity token validation failed');
      throw new GcpAuthError('Invalid GCP identity token');
    }
  }

  /**
   * Validates a Google OAuth token from a human user.
   * Returns basic user info for human token issuance.
   */
  async validateGoogleOAuthToken(
    googleToken: string,
  ): Promise<{ userId: string; email: string }> {
    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: googleToken,
        audience: this.googleOAuthClientId || undefined,
      });

      const payload = ticket.getPayload();
      if (!payload?.sub || !payload?.email) {
        throw new GcpAuthError('Google token missing required claims');
      }

      return {
        userId: `user_${payload.sub}`,
        email: payload.email,
      };
    } catch (err) {
      if (err instanceof GcpAuthError) throw err;
      this.logger.error({ err }, 'Google OAuth token validation failed');
      throw new GcpAuthError('Invalid Google OAuth token');
    }
  }
}

export class GcpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GcpAuthError';
  }
}
