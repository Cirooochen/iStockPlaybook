// Twelve Data error-response detection — spec:
// docs/validation/c7-twelve-data-contract-check.md's "missing/null/error
// behavior" finding: a whole-request failure (bad symbol, auth, rate
// limit) returns a DISTINCT JSON shape (`{code, message, status:"error"}`,
// confirmed across ApiBadRequestErrorResponseBody/
// ApiUnauthorizedErrorResponseBody/etc. in Twelve Data's OpenAPI spec) —
// not a 200 response with fields simply absent.
//
// This is treated as categorically different from a per-field MISSING:
// MISSING means "we successfully queried the provider, and a specific
// value legitimately isn't available." An error-shaped response means
// "the request itself failed" — a caller needs to know that explicitly
// (to decide whether to retry, alert, or fall back), not have it silently
// flattened into a RawMarketData that merely LOOKS like sparse data. So
// mappers.ts throws TwelveDataApiError for this case rather than
// returning an all-MISSING contract value.
export class TwelveDataApiError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(`Twelve Data API error ${code}: ${message}`);
    this.name = "TwelveDataApiError";
    this.code = code;
  }
}

export interface TwelveDataErrorResponse {
  code: number;
  message: string;
  status: "error";
}

export function isTwelveDataError(payload: unknown): payload is TwelveDataErrorResponse {
  if (typeof payload !== "object" || payload === null) return false;
  const record = payload as Record<string, unknown>;
  return record.status === "error" && typeof record.code === "number" && typeof record.message === "string";
}

export function throwIfTwelveDataError(payload: unknown): void {
  if (isTwelveDataError(payload)) {
    throw new TwelveDataApiError(payload.code, payload.message);
  }
}
