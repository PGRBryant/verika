/**
 * Varunai — Service Policy
 *
 * Observability hub. Has the highest-privilege grant in the
 * ecosystem: flag.write on MystWeaver. This is scoped tightly
 * — flag.write is a human-initiated operation.
 *
 * Varunai is registered now but built later. This policy is
 * ready for when it comes online.
 */
import type { ServicePolicy } from '@internal/verika-shared';

export const policy: ServicePolicy = {
  service: 'varunai',

  tokenTTL: {
    standard: 900, // 15 minutes
  },

  canCall: [
    {
      service: 'mystweaver-api',
      capabilities: [
        'flag.write',          // Highest-privilege grant — human-initiated only
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
};
