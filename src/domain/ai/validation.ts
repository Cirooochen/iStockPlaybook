// AI output grounding/validation — Phase H.5 (design doc §6). Deterministic,
// ordinary application code — NOT a second AI call "checking" the first
// one. Every value an AI response is allowed to contribute is checked
// mechanically before it ever reaches the UI:
//
//   1. enum validation       — IntentSuggestion.value must be a real
//                               production enum member for that question
//                               (src/domain/ai/enums.ts), excluding the
//                               question's own deferral literal.
//   2. citation validation   — every EvidenceFieldRef must be one of the
//                               known closed set AND correspond to a
//                               field actually present in the
//                               AIResearchContext that was sent (e.g. a
//                               reference to `guardrailPreview` when it
//                               wasn't included invalidates the point).
//   3. missing-evidence       — a point may cite MISSING/INSUFFICIENT_DATA/
//      consistency              UNKNOWN_FIT/incomplete evidence only as
//                               an uncertainty, never as a strength — a
//                               strength claim grounded even partly in
//                               absent evidence is dropped whole, not
//                               stripped down to its valid half (that
//                               would still be "blended in as if it were
//                               a signal," design doc §6 item 3).
//
// A response (or an individual point within it) that fails validation is
// DROPPED, never repaired or coerced to the nearest valid value (design
// doc §6 item 4) — see sanitizeEvidenceBrief/sanitizeIntentAssist's
// "all-or-nothing at the top level, drop-only at the point level" rule.
import { isValidIntentSuggestionValue } from "@/domain/ai/enums";
import { ALL_EVIDENCE_FIELD_REFS } from "@/types/ai-research";
import type {
  AIEvidenceBrief,
  AIIntentAssist,
  AIResearchContext,
  AIResponseMeta,
  EvidenceFieldRef,
  EvidencePoint,
  IntentAssistQuestion,
  IntentSuggestion,
} from "@/types/ai-research";

function isKnownEvidenceFieldRef(ref: string): ref is EvidenceFieldRef {
  return (ALL_EVIDENCE_FIELD_REFS as readonly string[]).includes(ref);
}

// Citation validation, part 2: does this (already-known) ref correspond
// to a field actually present in the context that was sent? Every ref
// except "guardrailPreview" always structurally exists in
// AIResearchContext's shape (its underlying evidence may itself be
// MISSING, but the field/path is always there to cite) — guardrailPreview
// alone is conditionally OMITTED from the context object entirely
// (src/domain/ai/context.ts), so citing it when absent is the one case
// this function actually rejects.
function refExistsInContext(ref: EvidenceFieldRef, context: AIResearchContext): boolean {
  if (ref === "guardrailPreview") return context.guardrailPreview !== undefined;
  return true;
}

// Design doc §6 item 3 — may this ref ground a "strength"/supporting
// claim, or only an "uncertainty"/caveat? True only for evidence that is
// genuinely scored/available/complete — never for MISSING,
// INSUFFICIENT_DATA, an always-UNKNOWN_FIT tag (audit-confirmed: every
// newly onboarded stock's modelFit is UNKNOWN_FIT in this codebase today,
// H.0 §5 item 1), incomplete portfolio valuation, or a guardrail tension
// (which is inherently something to flag, never something that supports
// a claim).
export function refAllowsStrength(ref: EvidenceFieldRef, context: AIResearchContext): boolean {
  switch (ref) {
    case "researchEvidence.momentum":
      return (
        context.researchEvidence.momentum.provenance === "DETERMINISTIC" &&
        context.researchEvidence.momentum.result.status === "SCORED"
      );
    case "researchEvidence.fundamentals":
      return (
        context.researchEvidence.fundamentals.provenance === "DETERMINISTIC" &&
        context.researchEvidence.fundamentals.result.status === "SCORED"
      );
    case "researchEvidence.fundamentals.modelFit":
      return false;
    case "researchEvidence.valuation":
      return false;
    case "researchEvidence.price":
      return context.researchEvidence.price.provenance === "SYSTEM";
    case "portfolioContext.currentWeightPct":
      return context.portfolioContext.currentWeightPct !== null;
    case "portfolioContext.valuation":
      return context.portfolioContext.valuation.state === "COMPLETE";
    case "guardrailPreview":
      return false;
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function sanitizeGroundedIn(raw: unknown, context: AIResearchContext): EvidenceFieldRef[] | null {
  if (!Array.isArray(raw)) return null;
  const refs: EvidenceFieldRef[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !isKnownEvidenceFieldRef(item)) return null;
    if (!refExistsInContext(item, context)) return null;
    refs.push(item);
  }
  return refs;
}

// bucket "strength": every cited ref must pass refAllowsStrength, AND at
// least one ref must be cited at all — a strength claim about THIS
// company must point at something real (design doc's EvidencePoint doc
// comment: an empty groundedIn is legal only for a disclosed generality,
// which belongs in uncertainties/caveats, never in strengths).
// bucket "uncertainty": any valid, in-context ref is fine, INCLUDING one
// that fails refAllowsStrength — that is the entire point (citing MISSING
// evidence IS the uncertainty). An empty groundedIn is also fine here (a
// disclosed generality, e.g. "growth-stage companies often show mixed
// guidance in early quarters").
export function sanitizeEvidencePoint(
  raw: unknown,
  context: AIResearchContext,
  bucket: "strength" | "uncertainty"
): EvidencePoint | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.text)) return null;

  const groundedIn = sanitizeGroundedIn(obj.groundedIn, context);
  if (groundedIn === null) return null;

  if (bucket === "strength") {
    if (groundedIn.length === 0) return null;
    if (!groundedIn.every((ref) => refAllowsStrength(ref, context))) return null;
  }

  return { text: obj.text, groundedIn };
}

export function sanitizeEvidenceBrief(
  raw: unknown,
  context: AIResearchContext,
  meta: AIResponseMeta
): AIEvidenceBrief | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.summary)) return null;
  if (!Array.isArray(obj.strengths) || !Array.isArray(obj.uncertainties)) return null;

  const strengths = obj.strengths
    .map((p) => sanitizeEvidencePoint(p, context, "strength"))
    .filter((p): p is EvidencePoint => p !== null);
  const uncertainties = obj.uncertainties
    .map((p) => sanitizeEvidencePoint(p, context, "uncertainty"))
    .filter((p): p is EvidencePoint => p !== null);

  // A response with a summary but zero surviving points anywhere is
  // treated as unusable, not "technically valid but empty" — design doc
  // §6 item 4: a malformed/ungrounded answer degrades to unavailable, not
  // a bare summary standing alone with nothing behind it.
  if (strengths.length === 0 && uncertainties.length === 0) return null;

  return { summary: obj.summary, strengths, uncertainties, meta };
}

function sanitizeIntentSuggestion(
  raw: unknown,
  context: AIResearchContext,
  question: IntentAssistQuestion
): IntentSuggestion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.value !== "string" || !isValidIntentSuggestionValue(question, obj.value)) return null;
  if (!isNonEmptyString(obj.rationale)) return null;

  const groundedIn = sanitizeGroundedIn(obj.groundedIn, context);
  if (groundedIn === null) return null;
  // Unlike a "strength" EvidencePoint, an empty groundedIn is legal for a
  // suggestion — design doc §5.1: Investment Role/Core Portion are
  // personal-preference questions evidence can't fully answer, so a
  // suggestion may legitimately lean on general reasoning alone.

  return { value: obj.value, rationale: obj.rationale, groundedIn };
}

function sanitizeStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every((v) => typeof v === "string")) return null;
  return raw.map((v) => (v as string).trim()).filter((v) => v.length > 0);
}

export function sanitizeIntentAssist(
  raw: unknown,
  context: AIResearchContext,
  question: IntentAssistQuestion,
  meta: AIResponseMeta
): AIIntentAssist | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.suggestions)) return null;

  const suggestions = obj.suggestions
    .map((s) => sanitizeIntentSuggestion(s, context, question))
    .filter((s): s is IntentSuggestion => s !== null)
    // §6 item 1 (enum validation) can legitimately drop every suggestion
    // if the model hallucinated invalid values. Cap at 3 per design doc
    // §5: "1-3 suggestions, not a ranked single answer."
    .slice(0, 3);

  const clarifyingQuestions = sanitizeStringArray(obj.clarifyingQuestions) ?? [];
  const caveats = sanitizeStringArray(obj.caveats) ?? [];

  // Unlike Evidence Brief, an empty `suggestions` array is still a
  // meaningful, honest response as long as clarifying questions exist
  // (design doc §5.1 — Investment Role/Core Portion may legitimately have
  // nothing evidence-grounded to suggest and lean entirely on questions
  // instead). Only reject outright if there is truly nothing usable.
  if (suggestions.length === 0 && clarifyingQuestions.length === 0) return null;

  return { question, suggestions, clarifyingQuestions, caveats, meta };
}
