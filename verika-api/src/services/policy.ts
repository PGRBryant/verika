import { pino, type Logger } from 'pino';
import type { ServicePolicy } from '@internal/verika-shared';

/**
 * Compiled policy data.
 *
 * This is the single source of truth at runtime for authorization decisions.
 * It mirrors the policy files in policies/*.policy.ts but lives inside the
 * API's compilation unit. The validate-policies.ts script ensures these stay
 * in sync during CI.
 *
 * Why inline instead of importing? The policy files sit outside verika-api's
 * rootDir and use a different module system. Compiling them here also means
 * no filesystem reads at startup — the data is baked into the deployment.
 */
const POLICIES: ServicePolicy[] = [
  {
    service: 'mystweaver-api',
    tokenTTL: { standard: 900 },
    canCall: [],
    humanRoles: {
      'mystweaver.admin': {
        canPerform: ['flag.write', 'flag.evaluate', 'experiments.read', 'audit.read'],
      },
      'mystweaver.viewer': {
        canPerform: ['flag.evaluate', 'experiments.read'],
      },
    },
  },
  {
    service: 'room404-game-server',
    tokenTTL: { standard: 900 },
    canCall: [
      {
        service: 'mystweaver-api',
        capabilities: ['flag.evaluate', 'flag.evaluate.bulk', 'events.track'],
      },
      {
        service: 'room404-ai-service',
        capabilities: [
          'content.generate.flavor',
          'content.generate.chaos',
          'content.judge',
          'content.generate.icon',
        ],
      },
    ],
    humanRoles: {
      'room404.presenter': {
        canPerform: ['session.manage', 'session.read'],
      },
    },
  },
  {
    service: 'room404-ai-service',
    tokenTTL: { standard: 900 },
    canCall: [],
  },
  {
    service: 'varunai',
    tokenTTL: { standard: 900 },
    canCall: [
      {
        service: 'mystweaver-api',
        capabilities: [
          'flag.write',
          'flag.evaluate',
          'experiments.read',
          'audit.read',
          'metrics.read',
          'stream.subscribe',
        ],
      },
      {
        service: 'room404-game-server',
        capabilities: ['session.read'],
      },
    ],
    humanRoles: {
      'varunai.presenter': {
        canPerform: ['dashboard.view', 'session.control'],
        extends: 'room404.presenter',
      },
    },
  },
  {
    service: 'verika',
    tokenTTL: { standard: 900 },
    canCall: [],
  },
];

export interface PolicyDecision {
  allowed: boolean;
  capabilities: string[];
  reason?: string;
}

export class PolicyService {
  private readonly policies: ReadonlyMap<string, ServicePolicy>;
  private readonly logger: Logger;

  constructor() {
    this.logger = pino({ name: 'policy-service' });

    const map = new Map<string, ServicePolicy>();
    for (const p of POLICIES) {
      map.set(p.service, p);
    }
    this.policies = map;

    this.logger.info(
      { services: [...map.keys()] },
      `Loaded ${map.size} service policies`,
    );
  }

  /**
   * Resolve what capabilities a caller should receive when calling a target.
   *
   * The token's `caps` array is the intersection of:
   *   1. What the caller's policy says it can request from this target (canCall)
   *   2. What the target's registry says it grants to this caller (grantedCapabilities)
   *
   * If the caller has no canCall entry for the target, the request is denied.
   */
  resolveCapabilities(
    callerId: string,
    targetId: string,
    targetGrantedCapabilities: { capability: string; allowedCallers: string[] }[],
  ): PolicyDecision {
    const callerPolicy = this.policies.get(callerId);
    if (!callerPolicy) {
      return { allowed: false, capabilities: [], reason: `No policy for caller ${callerId}` };
    }

    // Find the canCall entry for this target
    const callRule = callerPolicy.canCall.find((c) => c.service === targetId);
    if (!callRule) {
      return {
        allowed: false,
        capabilities: [],
        reason: `Policy for ${callerId} does not allow calls to ${targetId}`,
      };
    }

    // Intersect: only capabilities that (a) the policy allows AND (b) the target grants to this caller
    const grantedToThisCaller = new Set(
      targetGrantedCapabilities
        .filter((g) => g.allowedCallers.includes('*') || g.allowedCallers.includes(callerId))
        .map((g) => g.capability),
    );

    const capabilities = callRule.capabilities.filter((cap) => grantedToThisCaller.has(cap));

    if (capabilities.length === 0) {
      return {
        allowed: false,
        capabilities: [],
        reason: `No overlapping capabilities between ${callerId} policy and ${targetId} grants`,
      };
    }

    return { allowed: true, capabilities };
  }

  /**
   * Resolve the human roles a user should receive for a given target service.
   *
   * Walks the target service's `humanRoles` map and collects all role names.
   * If a role `extends` another role, that parent is included too.
   */
  resolveHumanRoles(targetService: string): string[] {
    const targetPolicy = this.policies.get(targetService);
    if (!targetPolicy?.humanRoles) {
      return [];
    }

    const roles: string[] = [];

    for (const [roleName, roleDef] of Object.entries(targetPolicy.humanRoles)) {
      roles.push(roleName);

      if (roleDef.extends && !roles.includes(roleDef.extends)) {
        roles.push(roleDef.extends);
      }
    }

    return roles;
  }

  getPolicy(serviceId: string): ServicePolicy | undefined {
    return this.policies.get(serviceId);
  }
}
