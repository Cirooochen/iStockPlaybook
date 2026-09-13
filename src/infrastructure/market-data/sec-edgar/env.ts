// SEC EDGAR requester identification — Phase E.7B.
//
// SEC's fair-access policy for data.sec.gov/www.sec.gov requires every
// automated request to carry a `User-Agent` identifying the requester
// (application name + a contact — see
// https://www.sec.gov/os/webmaster-faq#developers, and
// docs/phase-e6c-fundamentals-live-contract-cost-validation.md §0: "no
// API key required, only a User-Agent header identifying the requester,
// per SEC's fair-use policy"). There is no API key for this provider —
// this header is the only credential-like value it needs.
//
// Read from the environment (never hardcoded) so no personal contact
// email is committed to source, mirroring twelve-data/env.ts's
// TWELVE_DATA_API_KEY convention exactly. Callers reuse
// twelve-data/env.ts's loadDotEnvLocalIfPresent directly (a generic
// dotenv reader, not Twelve-Data-specific) rather than duplicating it
// here.
export function loadSecEdgarUserAgentFromEnv(): string {
  const value = process.env.SEC_EDGAR_USER_AGENT;
  if (value === undefined || value.trim() === "") {
    throw new Error(
      "SEC_EDGAR_USER_AGENT is not set. Add it to .env.local (see .env.local.example) as " +
        '"<app name> <contact email>" (e.g. "iStockPlaybook contact@example.com") — SEC requires every ' +
        "automated request to identify its requester; see https://www.sec.gov/os/webmaster-faq#developers."
    );
  }
  return value;
}
