// Phase I.4A — EV/Revenue Checkpoints Live Validation.
//
// A developer-only, ad hoc validation path — NOT production
// orchestration, NOT a unit test, NOT wired into the app. Run manually:
//
//   npm run validate:live-ev-revenue-checkpoints
//
// Requires SEC_EDGAR_USER_AGENT and TWELVE_DATA_API_KEY in the
// environment (.env.local). Pipeline: fetchLiveEvRevenueCheckpoints
// (src/infrastructure/market-data/valuation-orchestration.ts) for both
// reference stocks, one at a time, print-and-continue.
import { loadDotEnvLocalIfPresent } from "../src/infrastructure/market-data/twelve-data/env";
import { fetchLiveEvRevenueCheckpoints } from "../src/infrastructure/market-data/valuation-orchestration";
import type { EvRevenueCheckpoint } from "../src/domain/signals/valuation-checkpoints";

const STOCK_SYMBOLS = ["U", "ASML"];

function describeIntegrity(integrity: EvRevenueCheckpoint["currencyIntegrity"]): string {
  switch (integrity.status) {
    case "SAME_CURRENCY":
      return `SAME_CURRENCY(${integrity.currency})`;
    case "CONVERTED":
      return `CONVERTED(${integrity.from}->${integrity.to} @ ${integrity.rate})`;
    case "MISSING":
      return "MISSING"; // never actually reached — a MISSING integrity drops the checkpoint before it's returned
  }
}

function describeCheckpoint(c: EvRevenueCheckpoint): string {
  const integrity = describeIntegrity(c.currencyIntegrity);
  return (
    `  ${c.periodId.padEnd(9)} checkpointDate=${c.checkpointDate}  price=${c.price} ${c.priceCurrency}  ` +
    `shares=${c.sharesOutstanding.toLocaleString()}  marketCap=${c.marketCap.toLocaleString()} ${c.priceCurrency}  ` +
    `integrity=${integrity}  normalizedMarketCap=${c.normalizedMarketCap.toLocaleString()}  ` +
    `totalDebt=${c.totalDebt.toLocaleString()}  cash=${c.cashAndEquivalents.toLocaleString()}  ` +
    `EV=${c.enterpriseValue.toLocaleString()}  TTMRevenue=${c.trailingTwelveMonthRevenue.toLocaleString()}  ` +
    `EV/Revenue=${c.evToRevenue.toFixed(3)}`
  );
}

async function main(): Promise<void> {
  loadDotEnvLocalIfPresent();

  console.log("=== Phase I.4A — EV/Revenue Checkpoints Live Validation ===");

  for (const symbol of STOCK_SYMBOLS) {
    console.log("");
    console.log(`--- ${symbol} ---`);
    const checkedAt = new Date().toISOString();

    const checkpoints = await fetchLiveEvRevenueCheckpoints(symbol, checkedAt);

    if (checkpoints === undefined) {
      console.log("Result: FETCH FAILURE (see stderr above for the underlying error)");
      continue;
    }
    if (checkpoints.length === 0) {
      console.log("Result: EMPTY — every candidate checkpoint dropped (see stderr above / re-run E.7B live script for per-field detail)");
      continue;
    }
    console.log(`Result: ${checkpoints.length} checkpoint(s)`);
    for (const c of checkpoints) {
      console.log(describeCheckpoint(c));
    }
  }
}

main().catch((err) => {
  console.error("Unexpected error during live validation:", err);
  process.exitCode = 1;
});
