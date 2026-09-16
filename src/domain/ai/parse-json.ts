// Strips a markdown code fence some models wrap JSON in despite explicit
// instructions not to — pure text preprocessing, never a validation
// relaxation. JSON.parse and the sanitize*/grounding checks in
// validation.ts still fully enforce the actual contract; this only
// improves the odds a well-formed-but-fenced response isn't wastefully
// treated as UNAVAILABLE.
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}
