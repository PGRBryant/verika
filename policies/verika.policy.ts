/**
 * Verika — Self-Policy
 *
 * Verika's own policy. It does not call other ecosystem services.
 * It issues, validates, and revokes identity tokens.
 * Registry writes are human-only (via Terraform/scripts).
 */
import type { ServicePolicy } from '@internal/verika-shared';

export const policy: ServicePolicy = {
  service: 'verika',

  tokenTTL: {
    standard: 900, // 15 minutes
  },

  // Verika does not make outbound service-to-service calls
  canCall: [],
};
