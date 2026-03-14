import { KeyManagementServiceClient } from '@google-cloud/kms';
import * as jose from 'jose';
import * as crypto from 'node:crypto';
import type { ServiceRegistration } from '@internal/verika-shared';
import type { VerikaApiConfig } from '../config.js';

const TOKEN_TTL_SECONDS = 900; // 15 minutes
const HUMAN_TOKEN_TTL_SECONDS = 3600; // 60 minutes

interface ServiceTokenClaims {
  iss: 'verika';
  sub: string;
  aud: string;
  ver: string;
  proj: string;
  region: string;
  instance: string;
  caps: string[];
  iat: number;
  exp: number;
  jti: string;
}

interface HumanTokenClaims {
  iss: 'verika';
  sub: string;
  aud: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
  jti: string;
}

export class TokenSignerService {
  private readonly kmsClient: KeyManagementServiceClient;
  private readonly keyVersionName: string;
  private cachedPublicKey: crypto.KeyObject | null = null;
  private cachedJwks: jose.JWK | null = null;
  private publicKeyFetchedAt = 0;

  constructor(config: VerikaApiConfig) {
    this.kmsClient = new KeyManagementServiceClient();
    // Key version path — in production, use the latest enabled version
    this.keyVersionName = this.kmsClient.cryptoKeyVersionPath(
      config.projectId,
      config.kmsLocation,
      config.kmsKeyRing,
      config.kmsKeyName,
      '1',
    );
  }

  async signServiceToken(
    registration: ServiceRegistration,
    instanceId: string,
    targetService: string,
    capabilities: string[],
    region: string = 'us-east1',
  ): Promise<{ token: string; expiresAt: number; jti: string }> {
    const now = Math.floor(Date.now() / 1000);
    const jti = `tok_${crypto.randomBytes(6).toString('hex')}`;

    const claims: ServiceTokenClaims = {
      iss: 'verika',
      sub: registration.id,
      aud: targetService,
      ver: registration.version,
      proj: registration.project,
      region,
      instance: instanceId,
      caps: capabilities,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      jti,
    };

    const token = await this.signJwt(claims);
    return { token, expiresAt: claims.exp, jti };
  }

  async signHumanToken(
    userId: string,
    email: string,
    roles: string[],
    targetService: string,
  ): Promise<{ token: string; expiresAt: number; jti: string }> {
    const now = Math.floor(Date.now() / 1000);
    const jti = `tok_human_${crypto.randomBytes(6).toString('hex')}`;

    const claims: HumanTokenClaims = {
      iss: 'verika',
      sub: userId,
      aud: targetService,
      email,
      roles,
      iat: now,
      exp: now + HUMAN_TOKEN_TTL_SECONDS,
      jti,
    };

    const token = await this.signJwt(claims);
    return { token, expiresAt: claims.exp, jti };
  }

  async getPublicKeys(): Promise<{ keys: jose.JWK[] }> {
    const jwk = await this.getJwk();
    return { keys: [jwk] };
  }

  async checkHealth(): Promise<{ status: 'ok' | 'unhealthy' }> {
    try {
      await this.getPublicKeyFromKms();
      return { status: 'ok' };
    } catch {
      return { status: 'unhealthy' };
    }
  }

  private async signJwt(claims: ServiceTokenClaims | HumanTokenClaims): Promise<string> {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'verika-v1' }));
    const payload = Buffer.from(JSON.stringify(claims));

    const signingInput = `${base64url(header)}.${base64url(payload)}`;
    const digest = crypto.createHash('sha256').update(signingInput).digest();

    const [signResponse] = await this.kmsClient.asymmetricSign({
      name: this.keyVersionName,
      digest: { sha256: digest },
    });

    if (!signResponse.signature) {
      throw new Error('KMS returned empty signature');
    }

    const signature = typeof signResponse.signature === 'string'
      ? Buffer.from(signResponse.signature, 'base64')
      : Buffer.from(signResponse.signature);

    return `${signingInput}.${base64url(signature)}`;
  }

  private async getPublicKeyFromKms(): Promise<crypto.KeyObject> {
    const [publicKey] = await this.kmsClient.getPublicKey({
      name: this.keyVersionName,
    });

    if (!publicKey.pem) {
      throw new Error('KMS returned empty public key');
    }

    return crypto.createPublicKey(publicKey.pem);
  }

  private async getJwk(): Promise<jose.JWK> {
    const now = Date.now();
    // Cache public key for 5 minutes
    if (this.cachedJwks && now - this.publicKeyFetchedAt < 300_000) {
      return this.cachedJwks;
    }

    const publicKey = await this.getPublicKeyFromKms();
    this.cachedPublicKey = publicKey;
    this.cachedJwks = {
      ...await jose.exportJWK(publicKey),
      kid: 'verika-v1',
      alg: 'RS256',
      use: 'sig',
    };
    this.publicKeyFetchedAt = now;
    return this.cachedJwks;
  }
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}
