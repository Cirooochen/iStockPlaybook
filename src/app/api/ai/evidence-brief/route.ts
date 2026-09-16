// Evidence Brief API route — Phase H.5 (design doc §4, §10). Server-only
// entry point: the Anthropic API key never reaches the client bundle
// (Route Handlers are server-only by construction — no "use client" is
// possible or needed here). Builds AIResearchContext itself from the
// POSTed portfolio/evidence/intent pieces — never trusts a client-supplied
// AI-shaped summary (design doc §10: "the server does not re-derive
// portfolio/evidence facts from scratch or trust a client-supplied
// 'summary' of them").
import { NextResponse } from "next/server";
import { buildAIResearchContext } from "@/domain/ai/context";
import { fetchEvidenceBrief } from "@/infrastructure/ai/anthropic/orchestration";
import type { GuardrailPreview, PortfolioContext, ResearchEvidence, UserIntent } from "@/types/playbook-proposal";

interface RequestBody {
  instrument: { ticker: string; name: string };
  portfolioContext: PortfolioContext;
  researchEvidence: ResearchEvidence;
  userIntent: UserIntent;
  guardrailPreview: GuardrailPreview;
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
    b.guardrailPreview !== null
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

  const result = await fetchEvidenceBrief(context);
  return NextResponse.json(result, { status: 200 });
}
