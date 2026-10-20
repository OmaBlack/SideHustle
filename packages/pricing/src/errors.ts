export type PricingErrorCode =
  | 'UNKNOWN_PRODUCT'
  | 'UNKNOWN_KIT'
  | 'UNKNOWN_OPTION'
  | 'INVALID_OPTION_VALUE'
  | 'INVALID_QTY'
  | 'EMPTY_BUNDLE'
  | 'BAD_GOAL';

/** Thrown for malformed input. Business problems a buyer can fix (MOQ, stock) are returned as issues instead. */
export class PricingError extends Error {
  constructor(
    readonly code: PricingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PricingError';
  }
}
