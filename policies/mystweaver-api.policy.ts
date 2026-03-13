/**
 * MystWeaver API — Service Policy
 *
 * Feature flag and experimentation platform.
 * MystWeaver does not call other services — it is called by them.
 * Human roles cover admin (full control) and viewer (read-only).
 */
import type { ServicePolicy } from '@internal/verika-shared';

export const policy: ServicePolicy = {
  service: 'mystweaver-api',

  tokenTTL: {
    standard: 900, // 15 minutes
  },

  // MystWeaver does not make outbound service-to-service calls
  canCall: [],

  humanRoles: {
    'mystweaver.admin': {
      canPerform: ['flag.write', 'flag.evaluate', 'experiments.read', 'audit.read'],
    },
    'mystweaver.viewer': {
      canPerform: ['flag.evaluate', 'experiments.read'],
    },
  },
};
