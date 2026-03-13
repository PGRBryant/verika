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
}

export function loadConfig(): VerikaApiConfig {
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
  };
}
