// Pinned Gemini model names. Change ONLY here.
// Verified 2026-11-07 against our API key (v1beta, via the SDK's models.list()).

export const MODELS = {
  // Fast model for per-turn classification & text-mode patient replies (structured output)
  classifier: "gemini-3.5-flash",
  // Model for the cited debrief.
  // "gemini-3.1-pro-preview" is stronger but returns 429 (no free-tier quota) — switch if billing is enabled.
  debrief: "gemini-3.5-flash",
  // Real-time patient voice (Live API, bidiGenerateContent)
  // Fallback: "gemini-2.5-flash-native-audio-latest"
  live: "gemini-3.8-live",
  // Guideline library embeddings, 768 dims (see scripts/embed-guidelines.mts). Changing the
  // model or dims requires re-running the embed script. Newer option: "gemini-embedding-2".
  embedding: "gemini-embedding-001",
  // Patient portraits. ⚠ ALL image models have 0 quota on the free tier (429) — needs billing.
  // Higher quality option: "gemini-3-pro-image"
  image: "gemini-3.1-flash-image",
  // Voice fallback if Live fails: text → speech
  tts: "gemini-3.8-flash-tts",
} as const;
