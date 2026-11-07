// Pinned Gemini model names. Change ONLY here.
// Verified 2026-11-07 against our API key (v1beta, via the SDK's models.list()).

export const MODELS = {
  // Fast model for per-turn classification (structured output)
  classifier: "gemini-3.8-flash",
  // Model for the cited debrief.
  // "gemini-3.1-pro-preview" is stronger but returns 429 (no free-tier quota) — switch if billing is enabled.
  debrief: "gemini-3.8-flash",
  // Real-time patient voice (Live API, bidiGenerateContent)
  // Fallback: "gemini-2.5-flash-native-audio-latest"
  live: "gemini-3.8-live",
  // Guideline library embeddings (newer option: "gemini-embedding-2")
  embedding: "gemini-embedding-001",
  // Patient portraits (faster/cheaper option: "gemini-3.1-flash-image")
  image: "gemini-3-pro-image",
  // Voice fallback if Live fails: text → speech
  tts: "gemini-3.8-flash-tts",
} as const;
