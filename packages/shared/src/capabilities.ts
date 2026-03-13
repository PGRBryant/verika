// --- Flag ---
export const FLAG_EVALUATE = 'flag.evaluate' as const;
export const FLAG_EVALUATE_BULK = 'flag.evaluate.bulk' as const;
export const FLAG_WRITE = 'flag.write' as const;

// --- Events ---
export const EVENTS_TRACK = 'events.track' as const;

// --- Content ---
export const CONTENT_GENERATE_FLAVOR = 'content.generate.flavor' as const;
export const CONTENT_GENERATE_CHAOS = 'content.generate.chaos' as const;
export const CONTENT_JUDGE = 'content.judge' as const;
export const CONTENT_GENERATE_ICON = 'content.generate.icon' as const;

// --- Experiments ---
export const EXPERIMENTS_READ = 'experiments.read' as const;

// --- Audit ---
export const AUDIT_READ = 'audit.read' as const;

// --- Metrics ---
export const METRICS_READ = 'metrics.read' as const;

// --- Stream ---
export const STREAM_SUBSCRIBE = 'stream.subscribe' as const;

// --- Session ---
export const SESSION_READ = 'session.read' as const;
export const SESSION_MANAGE = 'session.manage' as const;

// --- Identity ---
export const IDENTITY_TOKEN_ISSUE = 'identity.token.issue' as const;
export const IDENTITY_TOKEN_VALIDATE = 'identity.token.validate' as const;
export const IDENTITY_TOKEN_REVOKE = 'identity.token.revoke' as const;

// --- Registry ---
export const REGISTRY_READ = 'registry.read' as const;
export const REGISTRY_WRITE = 'registry.write' as const;

// --- Herald ---
export const HERALD_NOTIFY = 'herald.notify' as const;

// --- Grouped by domain ---

export const FlagCapabilities = {
  EVALUATE: FLAG_EVALUATE,
  EVALUATE_BULK: FLAG_EVALUATE_BULK,
  WRITE: FLAG_WRITE,
} as const;

export const EventsCapabilities = {
  TRACK: EVENTS_TRACK,
} as const;

export const ContentCapabilities = {
  GENERATE_FLAVOR: CONTENT_GENERATE_FLAVOR,
  GENERATE_CHAOS: CONTENT_GENERATE_CHAOS,
  JUDGE: CONTENT_JUDGE,
  GENERATE_ICON: CONTENT_GENERATE_ICON,
} as const;

export const ExperimentsCapabilities = {
  READ: EXPERIMENTS_READ,
} as const;

export const AuditCapabilities = {
  READ: AUDIT_READ,
} as const;

export const MetricsCapabilities = {
  READ: METRICS_READ,
} as const;

export const StreamCapabilities = {
  SUBSCRIBE: STREAM_SUBSCRIBE,
} as const;

export const SessionCapabilities = {
  READ: SESSION_READ,
  MANAGE: SESSION_MANAGE,
} as const;

export const IdentityCapabilities = {
  TOKEN_ISSUE: IDENTITY_TOKEN_ISSUE,
  TOKEN_VALIDATE: IDENTITY_TOKEN_VALIDATE,
  TOKEN_REVOKE: IDENTITY_TOKEN_REVOKE,
} as const;

export const RegistryCapabilities = {
  READ: REGISTRY_READ,
  WRITE: REGISTRY_WRITE,
} as const;

export const HeraldCapabilities = {
  NOTIFY: HERALD_NOTIFY,
} as const;

export const AllCapabilities = {
  Flag: FlagCapabilities,
  Events: EventsCapabilities,
  Content: ContentCapabilities,
  Experiments: ExperimentsCapabilities,
  Audit: AuditCapabilities,
  Metrics: MetricsCapabilities,
  Stream: StreamCapabilities,
  Session: SessionCapabilities,
  Identity: IdentityCapabilities,
  Registry: RegistryCapabilities,
  Herald: HeraldCapabilities,
} as const;
