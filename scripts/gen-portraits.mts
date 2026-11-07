// Generates Jordan's portraits (one per Emotion) with Gemini image generation.
//
// Consistency strategy: generate "neutral" first, then create every other expression
// by EDITING the neutral image ("same person, change only the expression").
//
// Run (Node 24 runs TypeScript directly):
//   node --env-file=.env.local scripts/gen-portraits.mts            # missing ones only
//   node --env-file=.env.local scripts/gen-portraits.mts --force    # regenerate all
//   node --env-file=.env.local scripts/gen-portraits.mts sad tearful --force   # specific ones
//
// Output: public/portraits/<emotion>.<ext> + public/portraits/manifest.json
// Tip: if "neutral" looks wrong, regenerate it first, then regenerate the rest with --force.

import { GoogleGenAI } from "@google/genai";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Override with --model=<name>. Keep the default in sync with lib/models.ts (MODELS.image).
const MODEL =
  process.argv.find((a) => a.startsWith("--model="))?.split("=")[1] ?? "gemini-3.1-flash-image";
const OUT_DIR = join(process.cwd(), "public", "portraits");

// Edit this to change how Jordan looks. Fictional character — do not base on a real person.
const CHARACTER =
  "Jordan Lee, a fictional 34-year-old East Asian man with short slightly messy black hair, " +
  "tired eyes with faint dark circles, light stubble, wearing a plain grey hoodie";

const STYLE =
  "Head-and-shoulders portrait, facing the viewer, centered, square framing. " +
  "Soft painterly digital illustration (not photorealistic), muted desaturated colors, " +
  "soft clinical lighting, plain dark blue-grey background (#1A2640). " +
  "No text, no logos, no hands, no props. Respectful, realistic, non-stereotyped depiction.";

const EMOTIONS: Record<string, string> = {
  neutral: "a calm but tired neutral expression, looking at the viewer",
  withdrawn: "a withdrawn, guarded expression: gaze lowered and slightly away, shoulders hunched, arms crossed",
  sad: "a sad, heavy expression: downcast eyes, slight frown, low energy",
  tearful: "a tearful expression: eyes glistening with tears, brows pinched, vulnerable, looking slightly down",
  relieved: "a relieved, slightly hopeful expression: soft small smile, relaxed brows, making eye contact",
  irritable: "an irritable, impatient expression: tight lips, furrowed brows, glancing away",
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const requested = args.filter((a) => !a.startsWith("--"));
for (const r of requested) {
  if (!EMOTIONS[r]) throw new Error(`Unknown emotion "${r}". Use: ${Object.keys(EMOTIONS).join(", ")}`);
}
const targets = requested.length ? requested : Object.keys(EMOTIONS);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set (run with --env-file=.env.local)");
const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });

mkdirSync(OUT_DIR, { recursive: true });

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function findExisting(emotion: string): string | undefined {
  return readdirSync(OUT_DIR).find((f) => f.startsWith(`${emotion}.`) && f !== "manifest.json");
}

type ImagePart = { data: string; mimeType: string };

async function generate(prompt: string, base?: ImagePart): Promise<ImagePart> {
  const parts: object[] = [];
  if (base) parts.push({ inlineData: base });
  parts.push({ text: prompt });

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE"],
      // (personGeneration is not supported on the Gemini Developer API)
      imageConfig: { aspectRatio: "1:1" },
    },
  });

  const img = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!img?.data) {
    const reason = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? "no image returned";
    throw new Error(`Image generation failed: ${reason}`);
  }
  return { data: img.data, mimeType: img.mimeType ?? "image/png" };
}

function save(emotion: string, img: ImagePart): string {
  const file = `${emotion}.${EXT[img.mimeType] ?? "png"}`;
  writeFileSync(join(OUT_DIR, file), Buffer.from(img.data, "base64"));
  return file;
}

function loadImage(file: string): ImagePart {
  const ext = file.split(".").pop() ?? "png";
  const mimeType = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "image/png";
  return { data: readFileSync(join(OUT_DIR, file)).toString("base64"), mimeType };
}

// 1) Base image: neutral
let neutralFile = findExisting("neutral");
if (!neutralFile || (force && targets.includes("neutral"))) {
  console.log("→ neutral (base image)");
  const img = await generate(`${STYLE}\nSubject: ${CHARACTER}.\nExpression: ${EMOTIONS.neutral}.`);
  neutralFile = save("neutral", img);
  console.log(`  saved ${neutralFile}`);
}
const base = loadImage(neutralFile);

// 2) Other expressions: edit the base image so it stays the same person
for (const emotion of targets) {
  if (emotion === "neutral") continue;
  if (findExisting(emotion) && !force) {
    console.log(`· ${emotion} exists, skipping (use --force to regenerate)`);
    continue;
  }
  console.log(`→ ${emotion}`);
  try {
    const img = await generate(
      `Edit this portrait. Keep EXACTLY the same person, face, hairstyle, clothing, art style, ` +
        `framing, lighting, and background. Change ONLY the facial expression and body language to: ` +
        `${EMOTIONS[emotion]}. ${STYLE}`,
      base,
    );
    console.log(`  saved ${save(emotion, img)}`);
  } catch (err) {
    console.error(`  ✗ ${emotion}: ${err instanceof Error ? err.message : err}`);
  }
}

// 3) Manifest for the UI: { emotion: "/portraits/<file>" }
const manifest: Record<string, string> = {};
for (const emotion of Object.keys(EMOTIONS)) {
  const f = findExisting(emotion);
  if (f) manifest[emotion] = `/portraits/${f}`;
}
writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("\nmanifest.json:", manifest);
if (!existsSync(join(OUT_DIR, "neutral.png")) && !manifest.neutral) console.warn("No neutral image found.");
