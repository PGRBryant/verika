export interface ServicePolicy {
  service: string;
  tokenTTL: {
    /** seconds. V1: 900 (15 minutes) */
    standard: number;
    /** for sensitive endpoint calls */
    elevated?: number;
  };
  canCall: {
    service: string;
    capabilities: string[];
  }[];
  humanRoles?: {
    [role: string]: {
      canPerform: string[];
      extends?: string;
    };
  };
}
