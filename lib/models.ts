// Pinned Gemini model names. Change ONLY here.
// Verified 2026-11-07 against our API key (v1beta, via the SDK's models.list()).
//
// FREE TIER NOTE: "gemini-3.8-flash" allows only 20 requests/day, so we use Flash-Lite
// for per-turn and debrief calls. Image models have 0 free quota.

export const MODELS = {
  // Per-turn classification (structured output). Also read by lib/classifier.ts.
  classifier: "gemini-3.5-flash-lite",
  // Cited debrief feedback. Stronger options when billing is on: "gemini-3.8-flash", "gemini-3.1-pro-preview".
  debrief: "gemini-3.5-flash-lite",
  // Real-time patient voice (Live API, bidiGenerateContent)
  // Fallback: "gemini-2.5-flash-native-audio-latest"
  live: "gemini-3.8-live",
  // Guideline library embeddings, 768 dims (see scripts/embed-guidelines.mts). Changing the
  // model or dims requires re-running the embed script. Newer option: "gemini-embedding-2".
  embedding: "gemini-embedding-001",
  // Unused (portraits are the code-drawn JordanAvatar). Needs billing: 0 free quota.
  image: "gemini-3.1-flash-image",
  // Voice fallback if Live fails: text → speech
  tts: "gemini-3.8-flash-tts",
} as const;
