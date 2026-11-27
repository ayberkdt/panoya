/**
 * Typed domain errors. `code` is stable and machine readable; `messageKey` is an i18n key the UI
 * resolves to a safe, user-facing message. `details` must never contain note content, URLs or
 * amounts because errors can end up in logs.
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INVARIANT'
  | 'CONFLICT'
  | 'LIMIT'
  | 'QUOTA'
  | 'STORAGE'
  | 'UNSUPPORTED';

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, string | number | boolean>>;

  constructor(
    code: ErrorCode,
    messageKey: string,
    options: {
      retryable?: boolean;
      details?: Record<string, string | number | boolean>;
      cause?: unknown;
    } = {},
  ) {
    super(
      `${code}: ${messageKey}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'DomainError';
    this.code = code;
    this.messageKey = messageKey;
    this.retryable = options.retryable ?? false;
    this.details = Object.freeze({ ...(options.details ?? {}) });
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

export const invariant = (
  condition: unknown,
  messageKey: string,
  details?: Record<string, string | number | boolean>,
): asserts condition => {
  if (!condition) throw new DomainError('INVARIANT', messageKey, details ? { details } : {});
};
