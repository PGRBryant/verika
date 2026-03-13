import { Firestore } from '@google-cloud/firestore';
import type { ServiceRegistration } from '@internal/verika-shared';
import type { VerikaApiConfig } from '../config.js';

// TODO(verika-v2): Migrate to Cloud Spanner when service count exceeds 10
// or multi-region deployment requires global strong consistency for
// security-critical revocations. This interface does not change on migration.
// See docs/v2-spanner-migration.md. Estimated effort: 1 week.

const COLLECTION = 'service_registry';

export class RegistryService {
  private readonly db: Firestore;

  constructor(config: VerikaApiConfig) {
    this.db = new Firestore({
      projectId: config.projectId,
      databaseId: config.firestoreDatabase,
    });
  }

  async getService(id: string): Promise<ServiceRegistration | null> {
    const doc = await this.db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as ServiceRegistration;
  }

  async getAllServices(): Promise<ServiceRegistration[]> {
    const snapshot = await this.db.collection(COLLECTION).get();
    return snapshot.docs.map((doc) => doc.data() as ServiceRegistration);
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.db.collection(COLLECTION).doc(id).update({
      lastSeenAt: Date.now(),
    });
  }

  async createService(registration: ServiceRegistration): Promise<void> {
    await this.db.collection(COLLECTION).doc(registration.id).set(registration);
  }

  async updateServiceStatus(
    id: string,
    status: ServiceRegistration['status'],
  ): Promise<void> {
    await this.db.collection(COLLECTION).doc(id).update({ status });
  }

  async checkHealth(): Promise<{ status: 'ok' | 'unhealthy'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.db.collection(COLLECTION).limit(1).get();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch {
      return { status: 'unhealthy', latencyMs: Date.now() - start };
    }
  }
}
