"use client";

// Client-side hooks for the two H.5 AI surfaces — Phase H.5 (design doc
// §7). Both are fail-soft and timeout-bounded: a slow or failed AI call
// degrades to an "unavailable" status the calling UI must handle
// gracefully, and NEVER blocks the deterministic onboarding flow —
// Confirm Playbook has no precondition on either of these, unchanged.
import { useCallback, useRef, useState } from "react";
import type { AIEvidenceBrief, AIIntentAssist, IntentAssistQuestion } from "@/types/ai-research";
import type { GuardrailPreview, PortfolioContext, ResearchEvidence, UserIntent } from "@/types/playbook-proposal";

export type AIAssistStatus = "IDLE" | "LOADING" | "OK" | "UNAVAILABLE";

export interface AIRequestContext {
  instrument: { ticker: string; name: string };
  portfolioContext: PortfolioContext;
  researchEvidence: ResearchEvidence;
  userIntent: UserIntent;
  guardrailPreview: GuardrailPreview;
}

// Design doc §7 — Evidence Brief ~6-8s, Intent Assist ~8-10s. Not
// blocking: on timeout the triggering UI's own selection/Confirm remains
// fully usable, this only clears the loading state to "unavailable."
const EVIDENCE_BRIEF_TIMEOUT_MS = 8000;
const INTENT_ASSIST_TIMEOUT_MS = 10000;

async function postForAssist<T extends { status: "OK" }>(
  url: string,
  body: unknown,
  timeoutMs: number
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { status: string };
    if (data.status !== "OK") return null;
    return data as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// At most one Evidence Brief call per onboarding session (design doc §7:
// "Analyze triggers at most one Evidence Brief call per onboarding
// session") — request() is idempotent past the first call.
export function useEvidenceBrief() {
  const [status, setStatus] = useState<AIAssistStatus>("IDLE");
  const [brief, setBrief] = useState<AIEvidenceBrief | null>(null);
  const requestedRef = useRef(false);

  const request = useCallback((context: AIRequestContext) => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setStatus("LOADING");
    postForAssist<{ status: "OK"; brief: AIEvidenceBrief }>(
      "/api/ai/evidence-brief",
      context,
      EVIDENCE_BRIEF_TIMEOUT_MS
    ).then((result) => {
      if (result) {
        setBrief(result.brief);
        setStatus("OK");
      } else {
        setStatus("UNAVAILABLE");
      }
    });
  }, []);

  return { status, brief, request };
}

// One call per "Get AI help" click (design doc §5.2/§7) — reset() lets
// the overlay clear stale state when the user navigates to a different
// question.
export function useIntentAssist() {
  const [status, setStatus] = useState<AIAssistStatus>("IDLE");
  const [assist, setAssist] = useState<AIIntentAssist | null>(null);

  const request = useCallback((context: AIRequestContext, question: IntentAssistQuestion) => {
    setStatus("LOADING");
    setAssist(null);
    postForAssist<{ status: "OK"; assist: AIIntentAssist }>(
      "/api/ai/intent-assist",
      { ...context, question },
      INTENT_ASSIST_TIMEOUT_MS
    ).then((result) => {
      if (result) {
        setAssist(result.assist);
        setStatus("OK");
      } else {
        setStatus("UNAVAILABLE");
      }
    });
  }, []);

  const reset = useCallback(() => {
    setStatus("IDLE");
    setAssist(null);
  }, []);

  return { status, assist, request, reset };
}
