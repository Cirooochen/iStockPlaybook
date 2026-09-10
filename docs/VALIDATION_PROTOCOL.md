# Validation Protocol

Default protocol for all remaining Phase B.5 (and later) validation
checkpoints. Supersedes the ad-hoc report + review-packet pattern used
through B.5.4A. Does not change the approved B.5 roadmap — see
`phase-b5-algorithm-validation.md` for what each checkpoint tests.

---

## 1. Core validation principle

Validation first. Do not automatically fix findings.

For every checkpoint, classify findings as:

- PASS
- IMPLEMENTATION BUG
- RULE / MODEL DESIGN QUESTION
- NOT YET IMPLEMENTED

Only implementation bugs may be fixed automatically, and only if the
requested task explicitly allows fixes.

Rule/model/product questions must stop for human review.

## 2. Validation method

For each checkpoint:

1. Read only the relevant sections of `playbook-decision-engine-spec-v0.1.md`,
   `phase-b5-algorithm-validation.md`, and the relevant domain code.
2. Do not reread unrelated docs unless necessary.
3. Prefer deterministic domain tests.
4. Use real domain functions and real engine paths where the checkpoint
   requires propagation validation.
5. Do not duplicate existing tests unnecessarily.
6. Do not refactor unrelated code.
7. Do not change approved formulas/rules merely to make a validation pass.

## 3. Lean reporting

Create only ONE validation artifact per checkpoint:

```
docs/validation/<checkpoint>.md
```

Do NOT create a separate review packet unless explicitly requested.

Keep the report concise, using this structure:

```markdown
# <Checkpoint>

Status: PASS / FAIL / REVIEW REQUIRED

## Scenarios
Short table.

## Expected vs Actual
Short table.

## Findings
Only meaningful findings.

## Tests
Test count and relevant verification.

## Decision Needed
Only include this section when human review is actually required.
```

Avoid repeating architecture/spec material already documented elsewhere
— link/reference the relevant section instead.

## 4. Final response format

After completing a checkpoint, do NOT paste the full report into chat.

Return only:

```
REVIEW SUMMARY

Checkpoint:
Result:

Tests:

Implementation bugs:
- None / concise list

Design questions:
- None / concise list

Decision needed:
- None / concise question

Report:
- path
```

Keep this summary short.

## 5. Stop conditions

STOP and request review when:

- spec and implementation disagree;
- a rule/model/product decision is required;
- two layers produce semantically conflicting outputs;
- fixing something would change approved behavior;
- architecture needs to change;
- validation exposes an unexpected failure.

Do NOT continue into the next checkpoint after one of these findings.

## 6. Continue conditions

If a checkpoint:

- passes;
- has no implementation bug;
- has no unresolved design question;
- requires no architecture/spec decision;

then mark it complete in the roadmap.

Do not automatically start the next checkpoint unless the user
explicitly asked you to continue.

## 7. Role separation

```
Claude Code       = implementation + deterministic validation
ChatGPT / human   = product, model, architecture, and ambiguous-rule
                     review                       decisions
```

Do not escalate routine passing math/tests for review. Escalate
decisions, contradictions, unexpected behavior, or architecture issues.

## 8. Existing deferred issues

Preserve the currently documented deferred issues rather than
reopening them in every checkpoint unless new evidence materially
affects them. Examples include:

- transaction recording vs. strategy guardrails;
- HC-003 hard block vs. future warning/confirmation;
- `trimSizing` vs. `targetPosition.trimCapacity` integration;
- possible future UX signal for transactions exceeding `maximumNormalTrim`.

Do not repeatedly report these as new findings.

## 9. Verification depth

Use the cheapest verification appropriate to the change.

- Domain-only validation: focused tests + type-check may be enough.
- UI/integration changes: add lint/build/browser verification when
  relevant.

Do not run expensive unrelated verification mechanically if the
checkpoint does not touch those layers. Document what was actually run.
