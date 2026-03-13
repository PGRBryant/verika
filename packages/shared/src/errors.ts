export type VerikaErrorCode =
  | 'VERIKA_TOKEN_EXPIRED'
  | 'VERIKA_TOKEN_REVOKED'
  | 'VERIKA_TOKEN_INVALID_SIGNATURE'
  | 'VERIKA_CAPABILITY_MISSING'
  | 'VERIKA_CALLER_NOT_ALLOWED'
  | 'VERIKA_SERVICE_NOT_FOUND'
  | 'VERIKA_SERVICE_REVOKED'
  | 'VERIKA_UNREACHABLE'
  | 'VERIKA_EXCHANGE_FAILED';

export class VerikaError extends Error {
  readonly code: VerikaErrorCode;

  constructor(code: VerikaErrorCode, message: string) {
    super(message);
    this.name = 'VerikaError';
    this.code = code;
  }
}
