// SEC EDGAR-specific response DTOs — spec:
// docs/phase-e7a-sec-edgar-structured-fundamentals-adapter-design.md.
// Provider-specific shapes live ONLY inside this
// src/infrastructure/market-data/sec-edgar/ boundary — nothing here is
// exported outside this directory's own mappers, mirroring
// twelve-data/types.ts's own boundary note exactly.
//
// Every field is optional/untyped-safe on purpose: these describe what a
// well-formed response SHOULD contain, not a guarantee — mappers.ts
// treats every field as potentially absent or malformed and never
// trusts this shape blindly.

// One XBRL fact — a single reported value for one concept, one period,
// one filing. `start` is present for duration facts (revenue, operating
// income, operating cash flow, capex) and absent for instant/
// balance-sheet facts (cash, debt components) — design doc §0.2/§4.2.
export interface SecEdgarXbrlFact {
  start?: string; // e.g. "2026-01-01" — duration facts only
  end?: string; // e.g. "2026-03-31" — present on every fact
  val?: number;
  accn?: string; // accession number of the filing that reported this fact
  fy?: number; // fiscal year, e.g. 2026
  fp?: string; // fiscal period, e.g. "Q1".."Q4" or "FY"
  form?: string; // e.g. "10-Q"
  filed?: string; // e.g. "2026-05-07" — when the filing was actually published
  frame?: string; // e.g. "CY2025Q4I" — present on some comparative/frame-aligned facts
}

// One XBRL concept (e.g. "OperatingIncomeLoss") within facts["us-gaap"]
// or facts["dei"]. `units` is keyed by unit type ("USD", "EUR", "shares",
// ...) — design doc §6 requires reading one explicit currency unit key at
// a time, never an arbitrary first key, since non-currency-unit concepts
// (e.g. share counts) share this same payload shape.
export interface SecEdgarXbrlConcept {
  label?: string;
  description?: string;
  units?: Record<string, SecEdgarXbrlFact[] | undefined>;
}

// GET https://data.sec.gov/api/xbrl/companyfacts/CIK{10-digit}.json —
// every XBRL concept SEC has for this filer, across every namespace it
// has ever tagged with. "us-gaap" carries the six financial-statement
// fields (design doc §2/§3); "dei" (Document and Entity Information) is
// read only for shares outstanding (Phase I.1) — it is mandatory for
// every SEC XBRL filer regardless of accounting standard, unlike
// "us-gaap"'s financial facts, which some foreign private issuers report
// in a different currency (see mappers.ts's reporting-currency
// parameter) but still tag under this same namespace.
export interface SecEdgarCompanyFactsResponse {
  cik?: number; // unpadded, e.g. 1810806 — instrumentId is derived from this (design doc §1)
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<string, SecEdgarXbrlConcept | undefined>;
    dei?: Record<string, SecEdgarXbrlConcept | undefined>;
  };
}

// One entry of GET https://www.sec.gov/files/company_tickers.json — the
// whole response is an object keyed by numeric-string index ("0", "1",
// ...), NOT an array (design doc §0.1/§1).
export interface SecEdgarTickerEntry {
  cik_str?: number;
  ticker?: string;
  title?: string;
}

export type SecEdgarCompanyTickersResponse = Record<string, SecEdgarTickerEntry | undefined>;
