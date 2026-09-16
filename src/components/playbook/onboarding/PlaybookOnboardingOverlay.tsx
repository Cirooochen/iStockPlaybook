"use client";

// Playbook Onboarding — Phase H.4. Implements only the minimum UI needed
// to connect the approved H.3 flow (docs/phase-h3-playbook-onboarding-ux.md)
// to H.2's deterministic creation path (docs/phase-h2-deterministic-strategy-mapping.md):
// Questionnaire -> Analyze -> Review -> Confirm. Not a pixel-perfect
// rebuild of H.3's full visual design (no design-system work, no
// animation polish) — the screen sequence, question wording, discrepancy
// handling, and confirmation semantics are what H.4 is responsible for
// getting right.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Holding, HoldingSnapshot, PortfolioValuation, StockPlaybookConfig } from "@/types/portfolio";
import type {
  ConfidenceLevel,
  CorePortionBucket,
  CurrentIntention,
  InvestmentRole,
  PortfolioContext,
  ProposalSubject,
  ResearchEvidence,
  ThesisTrajectory,
  UserIntent,
} from "@/types/playbook-proposal";
import type { MomentumScoreResult } from "@/domain/signals/momentum-score";
import type { FundamentalsScoreResult } from "@/domain/signals/fundamentals-score";
import { buildProposal, corePortionBucketToFraction, corePortionForRole, createEmptyUserIntent } from "@/domain/playbook/proposal";
import { materializeStockPlaybookConfig, type MaterializeRejectionReason } from "@/domain/playbook/materialize-config";
import { DISCREPANCY_SEVERITY } from "@/domain/playbook/onboarding-discrepancies";
import { holdingWeightPct } from "@/domain/portfolio/snapshot";
import { concentrationLabel, concentrationStyle } from "@/domain/portfolio/concentration";
import { deriveTargetPosition } from "@/domain/portfolio/target-position";
import { fundamentalsModelFitLabel } from "@/domain/playbook/fundamentals-model-fit";
// Phase H.5 — AI-Assisted Research & Proposal (design:
// docs/phase-h5-ai-assisted-research-design.md). Both surfaces are
// strictly upstream of UserIntent (design doc §2): the Evidence Brief is
// passive/read-only display on Review; Intent Assist only ever offers
// suggestion CARDS the user must click, going through the exact same
// onSelect handlers every hand-authored option already uses. Neither
// surface can write to userIntent/proposal/config on its own.
import { useEvidenceBrief, useIntentAssist, type AIAssistStatus, type AIRequestContext } from "@/lib/use-ai-assist";
import type { AIEvidenceBrief, AIIntentAssist, IntentAssistQuestion } from "@/types/ai-research";

type Step = "intro" | "role" | "core" | "confidence" | "intention" | "thesis" | "analyze" | "review";

const QUESTION_STEPS_WITH_CORE: Step[] = ["role", "core", "confidence", "intention", "thesis"];
const QUESTION_STEPS_WITHOUT_CORE: Step[] = ["role", "confidence", "intention", "thesis"];

// Which Intent Assist question (if any) a given questionnaire step maps
// to — used both to show the "Get AI help" affordance on the right screen
// and to auto-trigger it when arriving via Review's "Decide" link.
const STEP_TO_INTENT_QUESTION: Partial<Record<Step, IntentAssistQuestion>> = {
  role: "INVESTMENT_ROLE",
  core: "CORE_PORTION",
  confidence: "CONFIDENCE",
  intention: "CURRENT_INTENTION",
  thesis: "THESIS_TRAJECTORY",
};

interface Props {
  holding: Holding;
  holdingSnapshot: HoldingSnapshot;
  valuation: PortfolioValuation;
  momentumResult?: MomentumScoreResult;
  fundamentalsResult?: FundamentalsScoreResult;
  onClose: () => void;
  onConfirm: (config: StockPlaybookConfig) => void;
}

interface OptionDef<T> {
  value: T;
  label: string;
  sub: string;
  // Marks the "not sure"/"help me..." deferral option — the ONLY option
  // that reveals the "Get AI help" affordance when selected (design doc
  // §5.2). Every other option stays exactly as before H.5.
  isDefer?: boolean;
}

const ROLE_OPTIONS: OptionDef<InvestmentRole>[] = [
  { value: "LONG_TERM_CORE", label: "A long-term core holding", sub: "You plan to hold this for years, and it's meant to be one of your bigger positions." },
  { value: "GROWTH", label: "A growth position", sub: "You believe in this company's growth and want meaningful exposure, without making it a cornerstone." },
  { value: "TACTICAL", label: "A smaller, tactical position", sub: "You're testing the idea or taking a smaller, opportunistic stake." },
  { value: "NOT_SURE", label: "I'm not sure — help me decide", sub: "We'll suggest a starting point you can revisit any time.", isDefer: true },
];

const CORE_OPTIONS: OptionDef<CorePortionBucket | "NOT_SURE">[] = [
  { value: "MOST_OF_IT", label: "Most of it", sub: "A small part could flex; most is permanent." },
  { value: "ABOUT_HALF", label: "About half", sub: "Half core, half open to tactical moves." },
  { value: "A_SMALLER_PART", label: "A smaller part", sub: "Only a portion is truly long-term." },
  { value: "NOT_SURE", label: "I'm not sure yet", sub: "We'll leave this open — you can decide before this applies.", isDefer: true },
];

const CONFIDENCE_OPTIONS: OptionDef<ConfidenceLevel>[] = [
  { value: "HIGH", label: "High", sub: "You're very confident in this investment." },
  { value: "MEDIUM", label: "Medium", sub: "You believe in it, with some open questions." },
  { value: "LOW", label: "Low", sub: "You're still forming a view." },
  { value: "HELP_ME_ASSESS", label: "Help me assess", sub: "We'll leave this open for now.", isDefer: true },
];

const INTENTION_OPTIONS: OptionDef<CurrentIntention>[] = [
  { value: "BUILD", label: "Build the position", sub: "You want to add to this over time." },
  { value: "HOLD", label: "Hold what I have", sub: "No change in size for now." },
  { value: "REDUCE", label: "Gradually reduce it", sub: "You want to trim this over time." },
  { value: "NOT_SURE", label: "I'm not sure", sub: "We'll leave this open for now.", isDefer: true },
];

const THESIS_OPTIONS: OptionDef<ThesisTrajectory>[] = [
  { value: "GETTING_STRONGER", label: "Getting stronger", sub: "Your reasons for owning this have become more convincing." },
  { value: "NO_MEANINGFUL_CHANGE", label: "No meaningful change", sub: "Your original reasons still hold." },
  { value: "SOME_DOUBTS", label: "Some doubts", sub: "A few things give you pause." },
  { value: "GETTING_WEAKER", label: "Getting weaker", sub: "Your original reasons are less convincing than before." },
  { value: "REASONS_NO_LONGER_HOLD", label: "My original reasons no longer hold", sub: "What made you buy this isn't true anymore." },
  { value: "NOT_SURE", label: "I'm not sure", sub: "We'll leave this open for now — it needs an answer before this Playbook can be confirmed.", isDefer: true },
];

// Reused by IntentAssistSuggestions (§ below) so an AI suggestion renders
// with the EXACT same label copy as the hand-authored option it maps to —
// never a second, divergent wording for the same underlying value.
const ALL_OPTION_LABELS: Record<string, string> = Object.fromEntries(
  [...ROLE_OPTIONS, ...CORE_OPTIONS, ...CONFIDENCE_OPTIONS, ...INTENTION_OPTIONS, ...THESIS_OPTIONS].map((o) => [
    o.value,
    o.label,
  ])
);

export function PlaybookOnboardingOverlay({
  holding,
  holdingSnapshot,
  valuation,
  momentumResult,
  fundamentalsResult,
  onClose,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [userIntent, setUserIntent] = useState<UserIntent>(createEmptyUserIntent());
  // Selecting "I'm not sure yet" on the Core Protection question leaves
  // userIntent.corePortion at MISSING — identical to "not yet answered."
  // This local flag is the only thing that distinguishes "explicitly
  // deferred" for the Continue-button/selected-card UI; it never feeds
  // the domain model.
  const [coreDeferred, setCoreDeferred] = useState(false);
  const [acknowledgedSoft, setAcknowledgedSoft] = useState(false);
  const [rejection, setRejection] = useState<MaterializeRejectionReason | null>(null);

  // Phase H.5 — Evidence Brief (passive, one call per session) and Intent
  // Assist (on-demand, one call per "Get AI help" click). Neither ever
  // writes to userIntent/proposal directly (design doc §2) — see the
  // QuestionScreen/ReviewScreen usages below for the only two places
  // their output reaches the UI at all.
  const evidenceBrief = useEvidenceBrief();
  const intentAssist = useIntentAssist();
  // Set only when a Review "Decide" link is clicked — auto-triggers
  // Intent Assist for that question immediately on arrival (design doc
  // §5.2), rather than requiring a second click on top of the jump. A
  // ref, not state: it's consumed (read + cleared) inside an effect, and
  // mutating a ref there — unlike calling setState — doesn't trigger a
  // cascading render.
  const autoAssistQuestionRef = useRef<IntentAssistQuestion | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Analyze -> Review auto-advance. Evidence itself was already fetched
  // server-side before this overlay ever opened (src/app/stocks/[ticker]/
  // page.tsx) — this is a deliberate brief transition, not a real wait,
  // so it never blocks on network from inside the overlay.
  useEffect(() => {
    if (step !== "analyze") return;
    const t = setTimeout(() => setStep("review"), 900);
    return () => clearTimeout(t);
  }, [step]);

  const role = userIntent.investmentRole.provenance !== "MISSING" ? userIntent.investmentRole.value : null;

  const questionSteps = role === "LONG_TERM_CORE" ? QUESTION_STEPS_WITH_CORE : QUESTION_STEPS_WITHOUT_CORE;
  const questionIndex = questionSteps.indexOf(step);
  const progressPct =
    questionIndex >= 0
      ? ((questionIndex + 1) / questionSteps.length) * 100
      : step === "analyze" || step === "review"
        ? 100
        : 0;

  function advanceFrom(current: Step) {
    if (current === "intro") return setStep("role");
    if (current === "role") return setStep(role === "LONG_TERM_CORE" ? "core" : "confidence");
    if (current === "core") return setStep("confidence");
    if (current === "confidence") return setStep("intention");
    if (current === "intention") return setStep("thesis");
    if (current === "thesis") return setStep("analyze");
  }

  function goBackFrom(current: Step) {
    if (current === "role") return setStep("intro");
    if (current === "core") return setStep("role");
    if (current === "confidence") return setStep(role === "LONG_TERM_CORE" ? "core" : "role");
    if (current === "intention") return setStep("confidence");
    if (current === "thesis") return setStep("intention");
    if (current === "review") return setStep("thesis");
  }

  const currentWeightPct = holdingWeightPct(holdingSnapshot, valuation);
  const portfolioContext: PortfolioContext = { holdingSnapshot, valuation, currentWeightPct };
  const subject: ProposalSubject = { instrumentId: holdingSnapshot.instrument.id, holdingId: holdingSnapshot.holdingId };
  const researchEvidence: ResearchEvidence = {
    price:
      holdingSnapshot.priceNative.status === "AVAILABLE"
        ? {
            provenance: "SYSTEM",
            value: { nativeAmount: holdingSnapshot.priceNative.value, currency: holdingSnapshot.instrument.nativeCurrency },
          }
        : { provenance: "MISSING" },
    momentum: momentumResult ? { provenance: "DETERMINISTIC", result: momentumResult } : { provenance: "MISSING" },
    fundamentals: fundamentalsResult
      ? { provenance: "DETERMINISTIC", result: fundamentalsResult, modelFit: "UNKNOWN_FIT" }
      : { provenance: "MISSING" },
    valuation: { provenance: "MISSING" },
  };

  const proposal = buildProposal({ subject, portfolioContext, userIntent, researchEvidence });
  const hardDiscrepancies = proposal.guardrailPreview.discrepancies.filter(
    (d) => DISCREPANCY_SEVERITY[d.code] === "HARD"
  );
  const softDiscrepancies = proposal.guardrailPreview.discrepancies.filter(
    (d) => DISCREPANCY_SEVERITY[d.code] === "SOFT"
  );

  // Phase H.5 — exactly the pieces src/domain/ai/context.ts's
  // buildAIResearchContext already reduces server-side; sent as-is, never
  // pre-summarized client-side (design doc §10).
  const aiRequestContext: AIRequestContext = {
    instrument: { ticker: holdingSnapshot.instrument.ticker ?? "", name: holdingSnapshot.instrument.name },
    portfolioContext,
    researchEvidence,
    userIntent,
    guardrailPreview: proposal.guardrailPreview,
  };

  // Evidence Brief fires once, automatically, when Analyze begins (design
  // doc §4) — decoupled from the 900ms transition effect above: if the AI
  // call is still in flight once Review renders, EvidenceBriefPanel shows
  // its own loading state rather than delaying navigation.
  useEffect(() => {
    if (step !== "analyze") return;
    evidenceBrief.request(aiRequestContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Intent Assist is reset on every question-step change so stale
  // suggestions from a previous question never bleed into the next one,
  // then re-triggered automatically ONLY when arriving via a Review
  // "Decide" link for this exact question (design doc §5.2) — every other
  // arrival (normal Continue/Back navigation) leaves it IDLE until the
  // user explicitly clicks "Get AI help."
  useEffect(() => {
    intentAssist.reset();
    const question = STEP_TO_INTENT_QUESTION[step];
    if (question && autoAssistQuestionRef.current === question) {
      intentAssist.request(aiRequestContext, question);
      autoAssistQuestionRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const unresolved: { label: string; jumpTo: Step }[] = [];
  if (role === null) unresolved.push({ label: "Investment role", jumpTo: "role" });
  if (role === "LONG_TERM_CORE" && userIntent.corePortion.status === "MISSING") {
    unresolved.push({ label: "Core protection", jumpTo: "core" });
  }
  if (userIntent.confidence.provenance === "MISSING" || userIntent.confidence.value === "HELP_ME_ASSESS") {
    unresolved.push({ label: "Confidence", jumpTo: "confidence" });
  }
  if (userIntent.currentIntention.provenance === "MISSING" || userIntent.currentIntention.value === "NOT_SURE") {
    unresolved.push({ label: "Current intention", jumpTo: "intention" });
  }
  if (userIntent.thesisTrajectory.provenance === "MISSING" || userIntent.thesisTrajectory.value === "NOT_SURE") {
    unresolved.push({ label: "Thesis", jumpTo: "thesis" });
  }

  const canConfirm = proposal.status === "READY_FOR_REVIEW" && hardDiscrepancies.length === 0 &&
    (softDiscrepancies.length === 0 || acknowledgedSoft);

  function handleConfirm() {
    const result = materializeStockPlaybookConfig(
      proposal,
      [holding],
      holdingSnapshot.quantity,
      acknowledgedSoft,
      new Date().toISOString()
    );
    if (!result.ok) {
      setRejection(result.reason);
      return;
    }
    onConfirm(result.config);
  }

  // Phase H.6 hardening — was calcTargetShares(..., maxPct, ...) (shares to
  // reach the TOP of the target range), which silently diverged from what
  // the real, post-confirmation Engine actually shows as "Recommended
  // holding" (deriveTargetPosition's preferredTargetShares — a midpoint-
  // of-range/core-aware preferred target, engine.ts:274-282). For a
  // position already near the midpoint of its target range, the two
  // numbers visibly disagreed (e.g. ASML/GROWTH: Review said 15 shares,
  // the confirmed page said 12), undermining "Review matches the
  // confirmed Playbook." Calling the SAME deterministic function the
  // Engine already uses — not a new investment rule — fixes this the same
  // way deriveStrategyFieldsFromIntent already guarantees the Strategy
  // fields above can never drift between preview and materialization.
  const targetAllocationRange = proposal.proposedConfiguration.targetAllocationRange;
  const corePositionField = proposal.proposedConfiguration.corePosition;
  const previewCoreShareRange =
    corePositionField && corePositionField.provenance !== "MISSING"
      ? { min: corePositionField.value.minShares, max: corePositionField.value.maxShares }
      : undefined;
  const targetShares =
    targetAllocationRange.provenance !== "MISSING" &&
    valuation.state === "COMPLETE" &&
    holdingSnapshot.priceNative.status === "AVAILABLE" &&
    currentWeightPct !== null
      ? deriveTargetPosition({
          currentShares: holdingSnapshot.quantity,
          currentWeightPct,
          portfolioTotalEur: valuation.totalValueBase,
          priceEur: holdingSnapshot.priceNative.value,
          targetWeightMinPct: targetAllocationRange.value.minPct,
          targetWeightMaxPct: targetAllocationRange.value.maxPct,
          coreShareRange: previewCoreShareRange,
        }).preferredTargetShares
      : null;

  const concentrationState = proposal.guardrailPreview.concentrationStateIfConfirmedNow;

  return (
    <div className="fixed inset-0 z-[100] bg-stone-50 overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-8 min-h-full flex flex-col">
        {/* Progress + close */}
        <div className="flex items-center gap-4 mb-10">
          <div className="flex-1 h-1 bg-stone-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600 rounded-full transition-[width] duration-300 [transition-timing-function:var(--ease-out)]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:text-stone-600 transition-colors motion-safe:active:scale-[0.97]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "intro" && (
          <IntroScreen name={holdingSnapshot.instrument.name} onStart={() => advanceFrom("intro")} />
        )}

        {step === "role" && (
          <QuestionScreen
            title="How do you see this position?"
            subtitle="This shapes how much of your portfolio we think this stock should take up."
            options={ROLE_OPTIONS}
            selected={role}
            onSelect={(value) => {
              if (value !== "LONG_TERM_CORE") setCoreDeferred(false);
              setUserIntent((prev) => ({
                ...prev,
                investmentRole: { provenance: "USER", value },
                corePortion: corePortionForRole(value === "NOT_SURE" ? null : value, prev.corePortion),
              }));
            }}
            onBack={() => goBackFrom("role")}
            onContinue={() => advanceFrom("role")}
            intentQuestion="INVESTMENT_ROLE"
            intentAssist={intentAssist}
            aiRequestContext={aiRequestContext}
          />
        )}

        {step === "core" && (
          <QuestionScreen
            title="How much of this do you think of as permanent?"
            subtitle="Some investors keep a portion they never plan to sell, no matter what happens short-term. Marking that portion protects it from your Playbook's trim suggestions later on."
            options={CORE_OPTIONS}
            selected={
              userIntent.corePortion.status === "PROVIDED"
                ? bucketFromFraction(userIntent.corePortion.value.fractionOfCurrentHolding)
                : coreDeferred
                  ? "NOT_SURE"
                  : null
            }
            onSelect={(value) => {
              setCoreDeferred(value === "NOT_SURE");
              setUserIntent((prev) => ({
                ...prev,
                corePortion:
                  value === "NOT_SURE"
                    ? { status: "MISSING" }
                    : { status: "PROVIDED", value: { fractionOfCurrentHolding: corePortionBucketToFraction(value) } },
              }));
            }}
            onBack={() => goBackFrom("core")}
            onContinue={() => advanceFrom("core")}
            intentQuestion="CORE_PORTION"
            intentAssist={intentAssist}
            aiRequestContext={aiRequestContext}
          />
        )}

        {step === "confidence" && (
          <QuestionScreen
            title="How confident are you in this investment?"
            subtitle="Be honest — this isn't about being right. It helps the Playbook know how much doubt or volatility to expect from you."
            options={CONFIDENCE_OPTIONS}
            selected={userIntent.confidence.provenance !== "MISSING" ? userIntent.confidence.value : null}
            onSelect={(value) => setUserIntent((prev) => ({ ...prev, confidence: { provenance: "USER", value } }))}
            onBack={() => goBackFrom("confidence")}
            onContinue={() => advanceFrom("confidence")}
            intentQuestion="CONFIDENCE"
            intentAssist={intentAssist}
            aiRequestContext={aiRequestContext}
          />
        )}

        {step === "intention" && (
          <QuestionScreen
            title="What do you want to do with this position right now?"
            subtitle="This is your starting intention — later we'll flag if it looks at odds with your actual portfolio."
            options={INTENTION_OPTIONS}
            selected={userIntent.currentIntention.provenance !== "MISSING" ? userIntent.currentIntention.value : null}
            onSelect={(value) => setUserIntent((prev) => ({ ...prev, currentIntention: { provenance: "USER", value } }))}
            onBack={() => goBackFrom("intention")}
            onContinue={() => advanceFrom("intention")}
            intentQuestion="CURRENT_INTENTION"
            intentAssist={intentAssist}
            aiRequestContext={aiRequestContext}
          />
        )}

        {step === "thesis" && (
          <QuestionScreen
            title="Have your reasons for owning this changed?"
            subtitle="Think back to why you first bought it. Do those reasons still hold up today?"
            options={THESIS_OPTIONS}
            selected={userIntent.thesisTrajectory.provenance !== "MISSING" ? userIntent.thesisTrajectory.value : null}
            onSelect={(value) => setUserIntent((prev) => ({ ...prev, thesisTrajectory: { provenance: "USER", value } }))}
            onBack={() => goBackFrom("thesis")}
            onContinue={() => advanceFrom("thesis")}
            intentQuestion="THESIS_TRAJECTORY"
            intentAssist={intentAssist}
            aiRequestContext={aiRequestContext}
          />
        )}

        {step === "analyze" && <AnalyzeScreen aiStatus={evidenceBrief.status} />}

        {step === "review" && (
          <ReviewScreen
            name={holdingSnapshot.instrument.name}
            currentShares={holdingSnapshot.quantity}
            unresolved={unresolved}
            hardDiscrepancies={hardDiscrepancies}
            softDiscrepancies={softDiscrepancies}
            acknowledgedSoft={acknowledgedSoft}
            setAcknowledgedSoft={setAcknowledgedSoft}
            proposal={proposal}
            targetShares={targetShares}
            concentrationState={concentrationState}
            evidenceBriefStatus={evidenceBrief.status}
            evidenceBrief={evidenceBrief.brief}
            rejection={rejection}
            canConfirm={canConfirm}
            onBack={() => goBackFrom("review")}
            onJump={(s) => {
              // Design doc §5.2 — arriving via "Decide" auto-triggers
              // Intent Assist for that exact question; ordinary Back/Edit
              // navigation elsewhere does not set this.
              const question = STEP_TO_INTENT_QUESTION[s];
              if (question) autoAssistQuestionRef.current = question;
              setStep(s);
            }}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}

function bucketFromFraction(fraction: number): CorePortionBucket | null {
  if (fraction === corePortionBucketToFraction("MOST_OF_IT")) return "MOST_OF_IT";
  if (fraction === corePortionBucketToFraction("ABOUT_HALF")) return "ABOUT_HALF";
  if (fraction === corePortionBucketToFraction("A_SMALLER_PART")) return "A_SMALLER_PART";
  return null;
}

function IntroScreen({ name, onStart }: { name: string; onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      {/* Phase H.6 hardening — a trailing "." was previously hardcoded
          after {name}, producing a double period for any company name
          that itself ends in one (e.g. "ASML Holding N.V.", live-found
          during H.6's ASML walkthrough). */}
      <h1 className="text-2xl font-semibold text-stone-900 mb-3">
        Let&rsquo;s build a Playbook for {name}
        {name.endsWith(".") ? "" : "."}
      </h1>
      <p className="text-sm text-stone-500 max-w-sm mb-8">
        A few short questions about how you think about this investment — then we&rsquo;ll show you a
        proposed Playbook based on your answers and your portfolio.
      </p>
      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 bg-teal-600 text-white rounded-lg px-6 py-2.5 text-sm font-semibold hover:bg-teal-700 transition-colors duration-[160ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.97]"
      >
        Start →
      </button>
    </div>
  );
}

function QuestionScreen<T extends string>({
  title,
  subtitle,
  options,
  selected,
  onSelect,
  onBack,
  onContinue,
  intentQuestion,
  intentAssist,
  aiRequestContext,
}: {
  title: string;
  subtitle: string;
  options: OptionDef<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  onBack: () => void;
  onContinue: () => void;
  // Phase H.5 — present only for questions Intent Assist supports (all
  // five today). Absent entirely, the screen behaves exactly as H.4 left
  // it — no AI-shaped code path is even reachable for a screen that opts
  // out.
  intentQuestion?: IntentAssistQuestion;
  intentAssist?: ReturnType<typeof useIntentAssist>;
  aiRequestContext?: AIRequestContext;
}) {
  const deferValue = options.find((o) => o.isDefer)?.value ?? null;
  const showIntentAssist =
    intentQuestion !== undefined &&
    intentAssist !== undefined &&
    aiRequestContext !== undefined &&
    deferValue !== null &&
    selected === deferValue;

  return (
    <div className="flex-1 flex flex-col">
      <button onClick={onBack} className="text-xs text-stone-400 hover:text-stone-600 transition-colors mb-6 self-start">
        ← Back
      </button>
      <h1 className="text-xl font-semibold text-stone-900 mb-2 text-center">{title}</h1>
      <p className="text-sm text-stone-500 text-center mb-8">{subtitle}</p>

      <div className="space-y-3 mb-6">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`w-full text-left rounded-xl border px-5 py-4 transition-colors ${
              selected === opt.value
                ? "border-teal-600 bg-teal-50/40"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <p className="text-sm font-semibold text-stone-900">{opt.label}</p>
            <p className="text-xs text-stone-500 mt-0.5">{opt.sub}</p>
          </button>
        ))}
      </div>

      {showIntentAssist && intentAssist && intentQuestion && aiRequestContext && (
        <div className="mb-8">
          {intentAssist.status === "IDLE" && (
            <button
              onClick={() => intentAssist.request(aiRequestContext, intentQuestion)}
              className="text-xs font-medium text-teal-700 hover:text-teal-800 underline"
            >
              Get AI help with this
            </button>
          )}
          {intentAssist.status === "LOADING" && <p className="text-xs text-stone-400">Thinking…</p>}
          {intentAssist.status === "UNAVAILABLE" && (
            <p className="text-xs text-stone-400">
              AI assistance isn&rsquo;t available right now — you can still choose an option above directly.
            </p>
          )}
          {intentAssist.status === "OK" && intentAssist.assist && (
            <IntentAssistSuggestions assist={intentAssist.assist} onSelect={(value) => onSelect(value as T)} />
          )}
        </div>
      )}

      <div className="mt-auto flex justify-end">
        <button
          onClick={onContinue}
          disabled={selected === null}
          className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors motion-safe:active:scale-[0.97] ${
            selected !== null
              ? "bg-teal-600 text-white hover:bg-teal-700"
              : "bg-stone-100 text-stone-400 cursor-not-allowed"
          }`}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// Phase H.5 — renders the suggestion cards from an already-validated
// AIIntentAssist (every `value` has already passed enum validation
// against this exact question's real production enum, validation.ts —
// `onSelect` therefore routes straight into the same typed handler every
// hand-authored option already uses, never a separate AI-only write
// path). Labels reuse ALL_OPTION_LABELS so a suggestion never introduces
// a second wording for a value the questionnaire already names.
function IntentAssistSuggestions({
  assist,
  onSelect,
}: {
  assist: AIIntentAssist;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-4 space-y-3">
      <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-widest">AI suggestions — you choose</p>
      {assist.suggestions.map((s) => (
        <button
          key={s.value}
          onClick={() => onSelect(s.value)}
          className="w-full text-left rounded-lg border border-teal-300 bg-white px-4 py-3 hover:border-teal-500 transition-colors"
        >
          <p className="text-sm font-semibold text-stone-900">{ALL_OPTION_LABELS[s.value] ?? s.value}</p>
          <p className="text-xs text-stone-500 mt-1">{s.rationale}</p>
        </button>
      ))}
      {assist.clarifyingQuestions.length > 0 && (
        <div className="text-xs text-stone-600 space-y-1">
          {assist.clarifyingQuestions.map((q, i) => (
            <p key={i}>• {q}</p>
          ))}
        </div>
      )}
      {assist.caveats.length > 0 && <p className="text-[11px] text-stone-400 italic">{assist.caveats.join(" ")}</p>}
    </div>
  );
}

function AnalyzeScreen({ aiStatus }: { aiStatus: AIAssistStatus }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <h1 className="text-lg font-semibold text-stone-900 mb-6">Building your proposal</h1>
      <div className="space-y-2 text-sm text-stone-500">
        <p>✓ Understanding what you told us</p>
        <p>✓ Checking your portfolio</p>
        <p>✓ Gathering market evidence</p>
        {/* Phase H.5 — the only genuinely async row here (design doc §4);
            the three above are already resolved by the time this screen
            renders (evidence was fetched server-side before the overlay
            ever opened). Never blocks the 900ms Analyze->Review timer. */}
        <p>{aiStatus === "OK" ? "✓" : aiStatus === "UNAVAILABLE" ? "○" : "⋯"} Reading the evidence</p>
      </div>
    </div>
  );
}

function ReviewScreen({
  name,
  currentShares,
  unresolved,
  hardDiscrepancies,
  softDiscrepancies,
  acknowledgedSoft,
  setAcknowledgedSoft,
  proposal,
  targetShares,
  concentrationState,
  evidenceBriefStatus,
  evidenceBrief,
  rejection,
  canConfirm,
  onBack,
  onJump,
  onConfirm,
}: {
  name: string;
  currentShares: number;
  unresolved: { label: string; jumpTo: Step }[];
  hardDiscrepancies: { code: string; message: string }[];
  softDiscrepancies: { code: string; message: string }[];
  acknowledgedSoft: boolean;
  setAcknowledgedSoft: (v: boolean) => void;
  proposal: ReturnType<typeof buildProposal>;
  targetShares: number | null;
  concentrationState: ReturnType<typeof buildProposal>["guardrailPreview"]["concentrationStateIfConfirmedNow"];
  evidenceBriefStatus: AIAssistStatus;
  evidenceBrief: AIEvidenceBrief | null;
  rejection: MaterializeRejectionReason | null;
  canConfirm: boolean;
  onBack: () => void;
  onJump: (step: Step) => void;
  onConfirm: () => void;
}) {
  const { fundamentals, momentum, valuation } = proposal.researchEvidence;
  const corePosition = proposal.proposedConfiguration.corePosition;

  return (
    <div className="flex-1 flex flex-col">
      <button onClick={onBack} className="text-xs text-stone-400 hover:text-stone-600 transition-colors mb-4 self-start">
        ← Edit answers
      </button>

      <div className="bg-white rounded-lg border border-stone-200 p-6 mb-4">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">Proposed Playbook</p>
        <h1 className="text-lg font-semibold text-stone-900">{name}</h1>
      </div>

      {unresolved.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest">Needs a decision</p>
          {unresolved.map((u) => (
            <div key={u.label} className="flex items-center justify-between text-sm text-amber-800">
              <span>{u.label} — not resolved yet</span>
              <button onClick={() => onJump(u.jumpTo)} className="text-xs font-medium underline">
                Decide
              </button>
            </div>
          ))}
        </div>
      )}

      {hardDiscrepancies.map((d) => (
        <div key={d.code} className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm font-semibold text-red-800 mb-1">This doesn&rsquo;t quite add up yet</p>
          <p className="text-sm text-red-700 leading-relaxed">{d.message}</p>
        </div>
      ))}

      {softDiscrepancies.map((d) => (
        <div key={d.code} className="bg-stone-100 border border-stone-200 rounded-lg p-4 mb-4">
          <p className="text-sm font-semibold text-stone-700 mb-1">Worth double-checking</p>
          <p className="text-sm text-stone-600 leading-relaxed mb-3">{d.message}</p>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={acknowledgedSoft}
              onChange={(e) => setAcknowledgedSoft(e.target.checked)}
            />
            I understand — continue anyway
          </label>
        </div>
      ))}

      <div className="bg-white rounded-lg border border-stone-200 p-6 mb-4">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4">Recommended holding (proposed)</p>
        {(() => {
          const targetAllocationRange = proposal.proposedConfiguration.targetAllocationRange;
          const accumulationCeilingPct = proposal.proposedConfiguration.accumulationCeilingPct;
          if (targetAllocationRange.provenance === "MISSING") {
            return <p className="text-sm text-stone-400">Answer the investment role question to see a proposal.</p>;
          }
          return (
            <>
              <div className="flex gap-4 text-sm text-stone-500 mb-3">
                <span>
                  Current holding{" "}
                  <span className="font-semibold text-stone-800 tabular-nums">{currentShares.toLocaleString("de-DE")}</span> shares
                </span>
                <span className="text-stone-300">→</span>
                <span>
                  Recommended holding{" "}
                  <span className="font-semibold text-stone-800 tabular-nums">
                    {targetShares === null ? "not currently determinable" : `${targetShares.toLocaleString("de-DE")} shares`}
                  </span>
                </span>
              </div>
              <p className="text-xs text-stone-500 mb-2">
                Target range {targetAllocationRange.value.minPct}–{targetAllocationRange.value.maxPct}% · Buy up to{" "}
                {accumulationCeilingPct.provenance !== "MISSING" ? accumulationCeilingPct.value : "?"}%
              </p>
              {corePosition && corePosition.provenance !== "MISSING" && (
                <p className="text-xs text-stone-500 mb-2">
                  Core protection: {corePosition.value.minShares}–{corePosition.value.maxShares} shares
                </p>
              )}
              {concentrationState ? (
                <span
                  className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${concentrationStyle[concentrationState].text} ${concentrationStyle[concentrationState].bg} ${concentrationStyle[concentrationState].border}`}
                >
                  {concentrationLabel[concentrationState]}
                </span>
              ) : (
                <p className="text-xs text-stone-400">
                  Not available — your portfolio&rsquo;s valuation is incomplete right now.
                </p>
              )}
            </>
          );
        })()}
      </div>

      <EvidenceBriefPanel status={evidenceBriefStatus} brief={evidenceBrief} />

      <div className="bg-white rounded-lg border border-stone-200 p-6 mb-4">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4">Reasoning</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-stone-600">Fundamentals</span>
            <span className="text-stone-500">
              {fundamentals.provenance !== "MISSING" && fundamentals.result.status === "SCORED"
                ? `${fundamentals.result.overall.state} · Model fit: ${fundamentalsModelFitLabel(fundamentals.modelFit)}`
                : "Not available"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-stone-600">Momentum</span>
            <span className="text-stone-500">
              {momentum.provenance !== "MISSING" && momentum.result.status === "SCORED"
                ? momentum.result.overall.state
                : "Not available"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-stone-600">Valuation</span>
            <span className="text-stone-500">{valuation.provenance === "MISSING" ? "Not available" : "—"}</span>
          </div>
        </div>
      </div>

      {rejection && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">
          Can&rsquo;t confirm yet: {rejectionLabel(rejection)}
        </div>
      )}

      <div className="mt-auto flex justify-end gap-3">
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors motion-safe:active:scale-[0.97] ${
            canConfirm ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-stone-100 text-stone-400 cursor-not-allowed"
          }`}
        >
          Confirm Playbook
        </button>
      </div>
    </div>
  );
}

function rejectionLabel(reason: MaterializeRejectionReason): string {
  if (reason === "UNRESOLVED_ANSWERS") return "some answers still need a decision.";
  if (reason === "HARD_DISCREPANCY") return "an answer conflicts with your portfolio — change it above.";
  if (reason === "SOFT_DISCREPANCY_NOT_ACKNOWLEDGED") return "please acknowledge the note above first.";
  return "this stock couldn't be set up.";
}

// Phase H.5 (design doc §4) — passive, read-only. Deliberately styled
// distinct from the deterministic Reasoning card just below it (a teal
// border/label instead of stone, no Positive/Neutral/Weak pill language)
// so it never reads as a fourth deterministic signal alongside
// Fundamentals/Momentum/Valuation — it is AI's interpretation OF those,
// not a peer to them. Never blocks Confirm Playbook in any status.
function EvidenceBriefPanel({ status, brief }: { status: AIAssistStatus; brief: AIEvidenceBrief | null }) {
  if (status === "IDLE" || status === "LOADING") {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-6 mb-4">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">AI interpretation</p>
        <p className="text-sm text-stone-400">Reading the evidence…</p>
      </div>
    );
  }

  if (status === "UNAVAILABLE" || !brief) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-6 mb-4">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">AI interpretation</p>
        <p className="text-sm text-stone-400">
          AI interpretation isn&rsquo;t available right now — the evidence below is unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-teal-200/70 p-6 mb-4">
      <p className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-2">AI interpretation</p>
      <p className="text-sm text-stone-700 mb-3">{brief.summary}</p>
      {brief.strengths.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">What looks supportive</p>
          <ul className="space-y-1">
            {brief.strengths.map((p, i) => (
              <li key={i} className="text-xs text-stone-600">
                • {p.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {brief.uncertainties.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">
            What&rsquo;s uncertain or missing
          </p>
          <ul className="space-y-1">
            {brief.uncertainties.map((p, i) => (
              <li key={i} className="text-xs text-stone-600">
                • {p.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
