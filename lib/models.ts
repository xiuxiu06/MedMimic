// Pinned Gemini model names. Change ONLY here.
// TODO (H0): confirm each name in Google AI Studio for our API key, then pin
// a specific version instead of a "-latest" alias so behavior can't shift mid-hackathon.

export const MODELS = {
  // Fast model for per-turn classification (structured output)
  classifier: "gemini-flash-latest",
  // Stronger model for the cited debrief
  debrief: "gemini-pro-latest",
  // Real-time patient voice (Live API, native audio) — TODO: confirm current Live model
  live: "TODO-live-native-audio-model",
  // Guideline library embeddings — TODO: confirm current embedding model
  embedding: "TODO-embedding-model",
  // Patient portraits — TODO: confirm current image model
  image: "TODO-image-model",
} as const;
