// SEC EDGAR error handling — Phase E.7B.
//
// SEC's XBRL/ticker endpoints have no error-response JSON shape to
// detect the way Twelve Data's `{code, message, status:"error"}` does
// (twelve-data/errors.ts) — a whole-request failure here is just a
// non-2xx HTTP status (e.g. 404 for an unknown CIK) with no structured
// body worth parsing. So this file's error classes are keyed off HTTP
// status / transport failure, not a detected body shape.
export class SecEdgarNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SecEdgarNetworkError";
    if (cause !== undefined) this.cause = cause;
  }
}

export class SecEdgarHttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`SEC EDGAR request failed (HTTP ${status}): ${url}`);
    this.name = "SecEdgarHttpError";
    this.status = status;
  }
}

// A structural failure of an already-2xx, already-JSON-parsed payload —
// e.g. `companyfacts` returning something that isn't shaped like a
// companyfacts response at all. Mirrors mappers.ts's own two-tier
// convention (C.8A): a whole-payload failure throws; a single field's
// every-candidate-tag-absent is MISSING, never this error.
export class SecEdgarMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecEdgarMappingError";
  }
}
