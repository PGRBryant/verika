import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import * as jose from 'jose';

// Generate a real RSA key pair for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// SHA-256 DigestInfo prefix (ASN.1 DER encoding for AlgorithmIdentifier + OctetString wrapper)
const SHA256_DIGEST_INFO_PREFIX = Buffer.from([
  0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86,
  0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
  0x00, 0x04, 0x20,
]);

const mockKmsClient = {
  cryptoKeyVersionPath: vi.fn().mockReturnValue('projects/test/locations/us/keyRings/ring/cryptoKeys/key/cryptoKeyVersions/1'),
  asymmetricSign: vi.fn().mockImplementation(async (request: { name: string; digest: { sha256: Buffer } }) => {
    // KMS receives a pre-computed SHA256 digest, wraps it in DigestInfo, and RSA-signs it.
    // This produces a valid RSASSA-PKCS1-v1_5 signature that jose can verify.
    const digestInfo = Buffer.concat([SHA256_DIGEST_INFO_PREFIX, request.digest.sha256]);
    const signature = crypto.privateEncrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      digestInfo,
    );
    return [{ signature }];
  }),
  getPublicKey: vi.fn().mockResolvedValue([{ pem: publicKey }]),
};

vi.mock('@google-cloud/kms', () => ({
  KeyManagementServiceClient: vi.fn(() => mockKmsClient),
}));

import { TokenSignerService } from './token-signer.js';

const mockConfig = {
  port: 8080,
  projectId: 'test-project',
  kmsKeyRing: 'test-ring',
  kmsKeyName: 'test-key',
  kmsLocation: 'us-east1',
  redisHost: 'localhost',
  redisPort: 6379,
  firestoreDatabase: 'test-db',
  environment: 'test',
  selfUrl: 'https://verika-test.run.app',
  allowedHumanDomains: [],
} as any;

const mockRegistration = {
  id: 'room404-game-server',
  version: '1.0.0',
  project: 'room404-490104',
  status: 'active' as const,
  endpoints: { production: 'https://room404.run.app' },
  grantedCapabilities: [],
  displayName: 'Room 404 Game Server',
  owner: 'team-room404',
  requiredCapabilities: [],
  runbook: '',
  createdAt: '',
  updatedAt: '',
  lastSeenAt: '',
} as any;

describe('TokenSignerService', () => {
  let signer: TokenSignerService;

  beforeEach(() => {
    vi.clearAllMocks();
    signer = new TokenSignerService(mockConfig);
  });

  describe('signServiceToken', () => {
    it('produces a valid 3-part JWT', async () => {
      const result = await signer.signServiceToken(
        mockRegistration,
        'inst-abc',
        'mystweaver-api',
        ['flag.evaluate'],
      );

      const parts = result.token.split('.');
      expect(parts).toHaveLength(3);
      expect(result.jti).toMatch(/^tok_[a-f0-9]{12}$/);
      expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('includes correct claims in the payload', async () => {
      const result = await signer.signServiceToken(
        mockRegistration,
        'inst-abc',
        'mystweaver-api',
        ['flag.evaluate', 'events.track'],
      );

      const pubKey = crypto.createPublicKey(publicKey);
      const { payload } = await jose.jwtVerify(result.token, pubKey, {
        issuer: 'verika',
        audience: 'mystweaver-api',
      });

      expect(payload.iss).toBe('verika');
      expect(payload.sub).toBe('room404-game-server');
      expect(payload.aud).toBe('mystweaver-api');
      expect(payload['ver']).toBe('1.0.0');
      expect(payload['proj']).toBe('room404-490104');
      expect(payload['region']).toBe('us-east1');
      expect(payload['instance']).toBe('inst-abc');
      expect(payload['caps']).toEqual(['flag.evaluate', 'events.track']);
      expect(payload.jti).toBe(result.jti);
    });

    it('sets TTL to 15 minutes', async () => {
      const before = Math.floor(Date.now() / 1000);
      const result = await signer.signServiceToken(
        mockRegistration,
        'inst-abc',
        'mystweaver-api',
        ['flag.evaluate'],
      );
      const after = Math.floor(Date.now() / 1000);

      // exp - iat should be 900 seconds
      const pubKey = crypto.createPublicKey(publicKey);
      const { payload } = await jose.jwtVerify(result.token, pubKey, { issuer: 'verika' });
      const ttl = (payload.exp as number) - (payload.iat as number);
      expect(ttl).toBe(900);
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
    });

    it('uses RS256 with kid verika-v1', async () => {
      const result = await signer.signServiceToken(
        mockRegistration,
        'inst-abc',
        'mystweaver-api',
        ['flag.evaluate'],
      );

      const pubKey = crypto.createPublicKey(publicKey);
      const { protectedHeader } = await jose.jwtVerify(result.token, pubKey, { issuer: 'verika' });
      expect(protectedHeader.alg).toBe('RS256');
      expect(protectedHeader.kid).toBe('verika-v1');
      expect(protectedHeader.typ).toBe('JWT');
    });

    it('generates unique jti for each token', async () => {
      const r1 = await signer.signServiceToken(mockRegistration, 'inst-1', 'mystweaver-api', ['flag.evaluate']);
      const r2 = await signer.signServiceToken(mockRegistration, 'inst-2', 'mystweaver-api', ['flag.evaluate']);
      expect(r1.jti).not.toBe(r2.jti);
    });
  });

  describe('signHumanToken', () => {
    it('includes correct claims with aud', async () => {
      const result = await signer.signHumanToken(
        'user_abc123',
        'presenter@example.com',
        ['varunai.presenter', 'room404.presenter'],
        'varunai',
      );

      const pubKey = crypto.createPublicKey(publicKey);
      const { payload } = await jose.jwtVerify(result.token, pubKey, {
        issuer: 'verika',
        audience: 'varunai',
      });

      expect(payload.iss).toBe('verika');
      expect(payload.sub).toBe('user_abc123');
      expect(payload.aud).toBe('varunai');
      expect(payload['email']).toBe('presenter@example.com');
      expect(payload['roles']).toEqual(['varunai.presenter', 'room404.presenter']);
      expect(payload.jti).toMatch(/^tok_human_[a-f0-9]{12}$/);
    });

    it('sets TTL to 60 minutes', async () => {
      const result = await signer.signHumanToken(
        'user_abc123',
        'presenter@example.com',
        ['varunai.presenter'],
        'varunai',
      );

      const pubKey = crypto.createPublicKey(publicKey);
      const { payload } = await jose.jwtVerify(result.token, pubKey, { issuer: 'verika' });
      const ttl = (payload.exp as number) - (payload.iat as number);
      expect(ttl).toBe(3600);
    });

    it('human token rejected when audience does not match', async () => {
      const result = await signer.signHumanToken(
        'user_abc123',
        'presenter@example.com',
        ['varunai.presenter'],
        'varunai',
      );

      const pubKey = crypto.createPublicKey(publicKey);
      await expect(
        jose.jwtVerify(result.token, pubKey, {
          issuer: 'verika',
          audience: 'room404-game-server', // wrong audience
        }),
      ).rejects.toThrow();
    });
  });

  describe('signJwt error handling', () => {
    it('throws when KMS returns empty signature', async () => {
      mockKmsClient.asymmetricSign.mockResolvedValueOnce([{ signature: null }]);

      await expect(
        signer.signServiceToken(mockRegistration, 'inst-abc', 'mystweaver-api', ['flag.evaluate']),
      ).rejects.toThrow('KMS returned empty signature');
    });
  });

  describe('getPublicKeys', () => {
    it('returns JWKS with correct metadata', async () => {
      const jwks = await signer.getPublicKeys();

      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0].kid).toBe('verika-v1');
      expect(jwks.keys[0].alg).toBe('RS256');
      expect(jwks.keys[0].use).toBe('sig');
      expect(jwks.keys[0].kty).toBe('RSA');
    });

    it('caches public key (does not re-fetch within 5 minutes)', async () => {
      await signer.getPublicKeys();
      await signer.getPublicKeys();
      await signer.getPublicKeys();

      // Only one KMS call despite three getPublicKeys calls
      expect(mockKmsClient.getPublicKey).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkHealth', () => {
    it('returns ok when KMS is reachable', async () => {
      const health = await signer.checkHealth();
      expect(health.status).toBe('ok');
    });

    it('returns unhealthy when KMS fails', async () => {
      mockKmsClient.getPublicKey.mockRejectedValueOnce(new Error('KMS unavailable'));
      const health = await signer.checkHealth();
      expect(health.status).toBe('unhealthy');
    });
  });
});
