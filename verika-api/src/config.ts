export interface VerikaApiConfig {
  port: number;
  projectId: string;
  kmsKeyRing: string;
  kmsKeyName: string;
  kmsLocation: string;
  redisHost: string;
  redisPort: number;
  firestoreDatabase: string;
  environment: 'development' | 'staging' | 'production';
  /** The public URL of this Verika API instance. Used as the expected audience for GCP identity tokens. */
  selfUrl: string;
  /** Allowed email domains for human token issuance. Empty array = all domains allowed. */
  allowedHumanDomains: string[];
  /** Google OAuth client ID for audience validation on human token exchange. */
  googleOAuthClientId: string;
}

export function loadConfig(): VerikaApiConfig {
  const domainsEnv = process.env['VERIKA_ALLOWED_HUMAN_DOMAINS'] ?? '';
  return {
    port: parseInt(process.env['PORT'] ?? '8080', 10),
    projectId: process.env['GCP_PROJECT_ID'] ?? 'verika-prod',
    kmsKeyRing: process.env['KMS_KEY_RING'] ?? 'verika-signing',
    kmsKeyName: process.env['KMS_KEY_NAME'] ?? 'token-signing-key',
    kmsLocation: process.env['KMS_LOCATION'] ?? 'us-east1',
    redisHost: process.env['REDIS_HOST'] ?? 'localhost',
    redisPort: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    firestoreDatabase: process.env['FIRESTORE_DATABASE'] ?? 'verika-registry',
    environment: (process.env['NODE_ENV'] as VerikaApiConfig['environment']) ?? 'development',
    selfUrl: process.env['VERIKA_SELF_URL'] ?? 'https://verika-api-prod.run.app',
    allowedHumanDomains: domainsEnv ? domainsEnv.split(',').map((d) => d.trim().toLowerCase()) : [],
    googleOAuthClientId: process.env['GOOGLE_OAUTH_CLIENT_ID'] ?? '',
  };
}
