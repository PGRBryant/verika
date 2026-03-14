/**
 * Room 404 Game Server — Service Policy
 *
 * Multiplayer game server. Calls MystWeaver for feature flags
 * and Room 404 AI Service for content generation.
 * Presenter human role for live session management.
 */
import type { ServicePolicy } from '@internal/verika-shared';

export const policy: ServicePolicy = {
  service: 'room404-game-server',

  tokenTTL: {
    standard: 900, // 15 minutes
  },

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
};
