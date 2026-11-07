import "server-only";
import { GoogleGenAI } from "@google/genai";

// Server-side Gemini client. Never import this from a client component:
// the API key must stay on the server. The browser gets short-lived Live tokens instead.

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    // v1beta: needed for Live API and preview models (v1 lists fewer models)
    client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });
  }
  return client;
}
