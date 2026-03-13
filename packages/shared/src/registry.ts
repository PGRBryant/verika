export interface ServiceRegistration {
  id: string;
  displayName: string;
  project: string;
  owner: string;
  status: 'active' | 'deprecated' | 'revoked';
  endpoints: {
    production: string;
    internal: string;
    health: string;
    staging?: string;
  };
  requiredCapabilities: string[];
  grantedCapabilities: {
    capability: string;
    allowedCallers: string[];
  }[];
  runbook: string;
  oncall: string;
  version: string;
  registeredAt: number;
  lastSeenAt: number;
}
