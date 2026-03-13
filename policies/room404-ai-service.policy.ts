/**
 * Room 404 AI Service — Service Policy
 *
 * Gemini wrapper for game content generation.
 * Called by the game server only — does not make outbound
 * service-to-service calls through Verika.
 */
import type { ServicePolicy } from '@internal/verika-shared';

export const policy: ServicePolicy = {
  service: 'room404-ai-service',

  tokenTTL: {
    standard: 900, // 15 minutes
  },

  // AI service is called, does not call other ecosystem services
  canCall: [],
};
