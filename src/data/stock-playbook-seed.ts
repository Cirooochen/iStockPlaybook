// v0.1 real-data cleanup — no longer reachable from production runtime
// (use-portfolio-state.ts starts configs empty). Kept as a test-only
// fixture (onboarding-integration.test.ts, snapshot.test.ts,
// stock-concentration-view.test.ts) — do not re-wire this into any
// production path.
//
// Real Portfolio Stock Playbook config seed — Phase G.1 (design §3, step 3).
// Joins unity-seed.ts's strategy/playbook to holdings-seed.ts's Unity
// holding by instrument identity (design §1.2b) rather than embedding one
// in the other — a StockPlaybookConfig can exist independently of current
// ownership, and a STOCK Holding can exist with no config yet.
import { unitySeed } from "@/data/unity-seed";
import { holdingsSeed } from "@/data/holdings-seed";
import { createStockPlaybookConfig } from "@/domain/portfolio/snapshot";
import type { StockPlaybookConfig } from "@/types/portfolio";

const unityConfig = createStockPlaybookConfig(
  "U",
  holdingsSeed,
  unitySeed.strategy,
  unitySeed.playbook
);

if (!unityConfig) {
  throw new Error(
    "stock-playbook-seed: Unity holding not found in holdings-seed.ts, or is not a STOCK holding — seed data is inconsistent."
  );
}

export const stockPlaybookConfigsSeed: StockPlaybookConfig[] = [unityConfig];
