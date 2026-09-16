// Intent Assist API route — Phase H.5 (design doc §5, §10). Same
// server-only, context-rebuilt-not-trusted shape as evidence-brief's
// route — see that file's header comment. `question` is validated
// against the same closed set validation.ts enforces on the response.
import { NextResponse } from "next/server";
import { buildAIResearchContext } from "@/domain/ai/context";
import { INTENT_QUESTION_VALUES } from "@/domain/ai/enums";
import { fetchIntentAssist } from "@/infrastructure/ai/anthropic/orchestration";
import type { GuardrailPreview, PortfolioContext, ResearchEvidence, UserIntent } from "@/types/playbook-proposal";
import type { IntentAssistQuestion } from "@/types/ai-research";

const VALID_QUESTIONS = Object.keys(INTENT_QUESTION_VALUES) as IntentAssistQuestion[];

interface RequestBody {
  instrument: { ticker: string; name: string };
  portfolioContext: PortfolioContext;
  researchEvidence: ResearchEvidence;
  userIntent: UserIntent;
  guardrailPreview: GuardrailPreview;
  question: IntentAssistQuestion;
}

function isValidRequestBody(body: unknown): body is RequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.instrument === "object" &&
    b.instrument !== null &&
    typeof b.portfolioContext === "object" &&
    b.portfolioContext !== null &&
    typeof b.researchEvidence === "object" &&
    b.researchEvidence !== null &&
    typeof b.userIntent === "object" &&
    b.userIntent !== null &&
    typeof b.guardrailPreview === "object" &&
    b.guardrailPreview !== null &&
    typeof b.question === "string" &&
    VALID_QUESTIONS.includes(b.question as IntentAssistQuestion)
  );
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ status: "UNAVAILABLE" }, { status: 400 });
  }

  if (!isValidRequestBody(payload)) {
    return NextResponse.json({ status: "UNAVAILABLE" }, { status: 400 });
  }

  const context = buildAIResearchContext({
    instrument: payload.instrument,
    portfolioContext: payload.portfolioContext,
    researchEvidence: payload.researchEvidence,
    userIntent: payload.userIntent,
    guardrailPreview: payload.guardrailPreview,
  });

  const result = await fetchIntentAssist(context, payload.question);
  return NextResponse.json(result, { status: 200 });
}
