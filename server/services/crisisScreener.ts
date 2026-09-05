/**
 * Deterministic, pre-AI crisis screening service.
 *
 * CRITICAL SAFETY & PRIVACY INVARIANTS:
 * 1. Executes strictly BEFORE any Gemini API call.
 * 2. Does NOT use an LLM or probabilistic reasoning.
 * 3. Does NOT diagnose medical or psychological conditions.
 * 4. Never logs triggering reflection content or user text.
 * 5. Returns a structured indicator to trigger static, pre-written crisis support guidance.
 * 6. Preserves the user's original journal content; does not delete or alter user reflections.
 */

// Normalized high-severity phrases and patterns indicating acute self-harm or suicide crisis
const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill(ing)?\s+myself)\b/i,
  /\b(want\s+to\s+die)\b/i,
  /\b(suicid(e|al))\b/i,
  /\b(end(ing)?\s+my\s+life)\b/i,
  /\b(take\s+my\s+own\s+life)\b/i,
  /\b(better\s+off\s+dead)\b/i,
  /\b(better\s+off\s+without\s+me)\b/i,
  /\b(hang(ing)?\s+myself)\b/i,
  /\b(shoot(ing)?\s+myself)\b/i,
  /\b(hurt(ing)?\s+myself)\b/i,
  /\b(harm(ing)?\s+myself)\b/i,
  /\b(self[- ]harm)\b/i,
  /\b(overdos(e|ing)\s+on)\b/i,
  /\b(jump(ing)?\s+off\s+a\s+(bridge|building|roof))\b/i,
  /\b(slit(ting)?\s+my\s+wrists?)\b/i,
  /\b(don'?t\s+want\s+to\s+(live|wake\s+up)\s+anymore)\b/i,
  /\b(no\s+(point|reason)\s+(in|to)\s+liv(e|ing))\b/i,
  /\b(can'?t|cannot)\s+go\s+on\s+living\b/i,
  /\b(goodbye\s+cruel\s+world)\b/i,
];

export interface CrisisScreeningResult {
  detected: boolean;
  requiresSupport: boolean;
  matchedCategory: 'self_harm_ideation' | null;
}

/**
 * Screens user input text for immediate, high-severity self-harm / crisis language.
 * Operates purely deterministically using normalized regular expressions.
 *
 * @param content The user message content to screen.
 * @returns CrisisScreeningResult indicating whether static safety support is required.
 */
export function screenForCrisis(content: string | undefined | null): CrisisScreeningResult {
  if (!content || typeof content !== 'string') {
    return { detected: false, requiresSupport: false, matchedCategory: null };
  }

  const normalized = content.toLowerCase().trim();
  if (normalized.length === 0) {
    return { detected: false, requiresSupport: false, matchedCategory: null };
  }

  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(normalized)) {
      // High-severity language matched. Return flag without logging the trigger text.
      return {
        detected: true,
        requiresSupport: true,
        matchedCategory: 'self_harm_ideation',
      };
    }
  }

  return {
    detected: false,
    requiresSupport: false,
    matchedCategory: null,
  };
}
