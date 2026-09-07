import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Static guardrail: PlaybookClientShell must render engine output, not
// sequence domain calls itself. If this test ever needs to be relaxed,
// decision orchestration has leaked back into the React layer.
const shellSource = readFileSync(
  path.resolve(process.cwd(), "src/components/playbook/PlaybookClientShell.tsx"),
  "utf-8"
);

describe("PlaybookClientShell — no decision orchestration in React", () => {
  it("calls the decision engine", () => {
    expect(shellSource).toContain('from "@/domain/engine"');
  });

  const orchestrationOnlyModules = [
    "@/domain/portfolio/concentration",
    "@/domain/playbook/hard-constraints",
    "@/domain/playbook/stance-rules",
    "@/domain/playbook/action-zones",
    "@/domain/playbook/scoring",
    "@/domain/thesis/thesis",
    "@/domain/signals/signals",
  ];

  it.each(orchestrationOnlyModules)("does not import %s directly", (moduleSpecifier) => {
    expect(shellSource).not.toContain(`from "${moduleSpecifier}"`);
  });
});
