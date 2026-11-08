"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleGenAI,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
} from "@google/genai";
import {
  isOutOfCharacterOrNonEnglish,
  sanitizePatientReply,
} from "../../lib/patientPrompt";
import { JORDAN_SCENARIO_V2, type ScenarioV2 } from "../../lib/scenarios";
import type { EngineState, Message } from "../../lib/types";

export type LiveConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface UseGeminiLiveCallbacks {
  onStudentTranscriptFinal?: (transcript: string) => void;
  onPatientTranscriptUpdate?: (partialTranscript: string) => void;
  onPatientTurnComplete?: (finalTranscript: string) => void;
}

function base64ToInt16Pcm(base64: string): Int16Array {
  const binary = window.atob(base64);
  const byteLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function float32ToBase64Pcm16(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 16000,
): string {
  let samples = input;
  if (sourceSampleRate !== targetSampleRate) {
    const ratio = sourceSampleRate / targetSampleRate;
    const outLength = Math.max(1, Math.round(input.length / ratio));
    const resampled = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(
        input.length,
        Math.max(start + 1, Math.floor((i + 1) * ratio)),
      );
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += input[j];
      }
      resampled[i] = sum / (end - start);
    }
    samples = resampled;
  }

  const pcm16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

type LiveSession = Awaited<ReturnType<GoogleGenAI["live"]["connect"]>>;

export function useGeminiLive(callbacks: UseGeminiLiveCallbacks) {
  const [status, setStatus] = useState<LiveConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isMicStreaming, setIsMicStreaming] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveInputPreview, setLiveInputPreview] = useState("");

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const sessionRef = useRef<LiveSession | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef<number>(0);
  const meterFrameRef = useRef<number | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micActiveRef = useRef<boolean>(false);

  const studentTranscriptBufRef = useRef<string>("");
  const patientTranscriptBufRef = useRef<string>("");
  const studentTurnDispatchedRef = useRef<boolean>(false);
  const recoveryAttemptedRef = useRef<boolean>(false);
  const awaitingModelReplyRef = useRef<boolean>(false);
  const lastPlaybackEndedAtRef = useRef<number>(0);

  const stopMeter = useCallback(() => {
    if (meterFrameRef.current !== null) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startMeter = useCallback(() => {
    if (meterFrameRef.current !== null) return;
    const dataArray = new Uint8Array(256);

    const tick = () => {
      const analyser = analyserRef.current;
      if (!analyser || activeSourcesRef.current.size === 0) {
        meterFrameRef.current = null;
        setIsSpeaking(false);
        setAudioLevel(0);
        return;
      }

      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const centered = (dataArray[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const normalized = Math.min(1, rms * 4.2);
      setAudioLevel(normalized);
      setIsSpeaking(true);

      meterFrameRef.current = window.requestAnimationFrame(tick);
    };

    meterFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const clearPlaybackQueue = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped source
      }
    }
    activeSourcesRef.current.clear();
    nextPlayTimeRef.current = 0;
    setIsSpeaking(false);
    stopMeter();
  }, [stopMeter]);

  const enqueuePcm24k = useCallback(
    (base64Data: string) => {
      let ctx = playbackCtxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new window.AudioContext({ sampleRate: 24000 });
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.connect(ctx.destination);
        playbackCtxRef.current = ctx;
        analyserRef.current = analyser;
      }

      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const pcm16 = base64ToInt16Pcm(base64Data);
      if (pcm16.length === 0) return;

      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyserRef.current ?? ctx.destination);

      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.015, nextPlayTimeRef.current);
      nextPlayTimeRef.current = startAt + audioBuffer.duration;

      activeSourcesRef.current.add(source);
      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (activeSourcesRef.current.size === 0) {
          lastPlaybackEndedAtRef.current = performance.now();
          setIsSpeaking(false);
          stopMeter();
        }
      };

      source.start(startAt);
      startMeter();
    },
    [startMeter, stopMeter],
  );

  const stopMicCapture = useCallback((sendStreamEnd: boolean = true) => {
    const wasActive = micActiveRef.current;
    micActiveRef.current = false;
    setIsMicStreaming(false);

    if (sendStreamEnd && wasActive && sessionRef.current) {
      try {
        sessionRef.current.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // Ignore if socket closed
      }
    }

    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current.onaudioprocess = null;
      micProcessorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    if (micCtxRef.current && micCtxRef.current.state !== "closed") {
      void micCtxRef.current.close();
      micCtxRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    stopMicCapture(false);
    clearPlaybackQueue();

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        // Ignore
      }
      sessionRef.current = null;
    }

    studentTranscriptBufRef.current = "";
    patientTranscriptBufRef.current = "";
    studentTurnDispatchedRef.current = false;
    recoveryAttemptedRef.current = false;
    awaitingModelReplyRef.current = false;
    setLiveInputPreview("");
    setStatus("disconnected");
  }, [clearPlaybackQueue, stopMicCapture]);

  const flushStudentTranscriptIfNeeded = useCallback(() => {
    const fullStudentText = studentTranscriptBufRef.current.trim();
    if (fullStudentText && !studentTurnDispatchedRef.current) {
      studentTurnDispatchedRef.current = true;
      studentTranscriptBufRef.current = "";
      setLiveInputPreview("");
      callbacksRef.current.onStudentTranscriptFinal?.(fullStudentText);
    }
  }, []);

  const connect = useCallback(
    async (
      state: EngineState,
      seedMessages: readonly Message[] = [],
      scenario: ScenarioV2 = JORDAN_SCENARIO_V2,
    ) => {
      disconnect();
      setStatus("connecting");
      setError(null);

      try {
        const res = await fetch("/api/live-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, scenario }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          token?: string;
          apiVersion?: string;
          model?: string;
          voiceName?: string;
          systemInstruction?: string;
          error?: string;
        };

        if (!data.ok || !data.token || !data.model) {
          throw new Error(data.error ?? "Failed to mint Gemini Live token");
        }

        const ai = new GoogleGenAI({
          apiKey: data.token,
          httpOptions: { apiVersion: data.apiVersion ?? "v1alpha" },
        });

        const selectedVoice =
          data.voiceName ?? scenario.voiceName ?? "Achird";

        const session = await ai.live.connect({
          model: data.model,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              languageCode: "en-US",
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
            inputAudioTranscription: {
              languageCodes: ["en-US"],
            },
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                startOfSpeechSensitivity:
                  StartSensitivity.START_SENSITIVITY_LOW,
                silenceDurationMs: 650,
              },
            },
            systemInstruction: {
              parts: [{ text: data.systemInstruction ?? "" }],
            },
          },
          callbacks: {
            onopen: () => {
              setStatus("connected");
            },
            onmessage: (msg: LiveServerMessage) => {
              const sc = msg.serverContent;
              if (!sc) return;

              if (sc.interrupted) {
                clearPlaybackQueue();
              }

              // Accumulate spoken student transcript (English-only ASR configured above)
              if (sc.inputTranscription?.text) {
                if (sc.inputTranscription.text.trim()) {
                  awaitingModelReplyRef.current = true;
                }
                studentTurnDispatchedRef.current = false;
                recoveryAttemptedRef.current = false;
                studentTranscriptBufRef.current += sc.inputTranscription.text;
                setLiveInputPreview(studentTranscriptBufRef.current.trim());
              }

              // Guard: never play or display unprompted model speech if the user
              // has not spoken or sent text since the previous turn finished.
              if (!awaitingModelReplyRef.current && !micActiveRef.current) {
                return;
              }

              // Process ALL parts in modelTurn (audio chunks, etc.)
              if (sc.modelTurn?.parts) {
                // Once Jordan starts replying, finalize the student's spoken transcript
                flushStudentTranscriptIfNeeded();

                for (const part of sc.modelTurn.parts) {
                  if (part.inlineData?.data) {
                    enqueuePcm24k(part.inlineData.data);
                  }
                }
              }

              if (sc.outputTranscription?.text) {
                flushStudentTranscriptIfNeeded();
                patientTranscriptBufRef.current += sc.outputTranscription.text;

                // Circuit breaker: immediately abort & self-correct if the Live model ever
                // slips into a medical-advice disclaimer or Spanish output
                if (
                  isOutOfCharacterOrNonEnglish(patientTranscriptBufRef.current)
                ) {
                  clearPlaybackQueue();
                  patientTranscriptBufRef.current = "";
                  callbacksRef.current.onPatientTranscriptUpdate?.("");

                  if (!recoveryAttemptedRef.current && sessionRef.current) {
                    recoveryAttemptedRef.current = true;
                    awaitingModelReplyRef.current = true;
                    try {
                      sessionRef.current.sendClientContent({
                        turns: [
                          {
                            role: "user",
                            parts: [
                              {
                                text: `[DIRECTOR CUE FOR ${scenario.patient.name.toUpperCase()} — SILENT CORRECTION: Do NOT give disclaimers, health facts, or speak Spanish. Reply right now in 1–2 natural conversational sentences (or 3–4 if appropriate) strictly in English (en-US) in first person ('I') as clinic patient ${scenario.patient.name} responding to the clinician.]`,
                              },
                            ],
                          },
                        ],
                        turnComplete: true,
                      });
                    } catch {
                      // Ignore if socket closed
                    }
                  }
                  return;
                }

                callbacksRef.current.onPatientTranscriptUpdate?.(
                  patientTranscriptBufRef.current.trim(),
                );
              }

              if (sc.turnComplete) {
                flushStudentTranscriptIfNeeded();
                const finalPatient = sanitizePatientReply(
                  patientTranscriptBufRef.current,
                );
                patientTranscriptBufRef.current = "";
                awaitingModelReplyRef.current = false;
                if (
                  finalPatient &&
                  !isOutOfCharacterOrNonEnglish(finalPatient)
                ) {
                  recoveryAttemptedRef.current = false;
                  callbacksRef.current.onPatientTurnComplete?.(finalPatient);
                }
              }
            },
            onerror: (err) => {
              setError(err.message || "Gemini Live WebSocket error");
              setStatus("error");
            },
            onclose: () => {
              sessionRef.current = null;
              setIsMicStreaming(false);
              setStatus((prev) => (prev === "error" ? "error" : "disconnected"));
            },
          },
        });

        sessionRef.current = session;

        // Seed conversation history starting with an explicit clinician user turn
        // so the Live model never confuses who is the clinician (user) vs patient (model).
        const firstName =
          scenario.patient.name.split(/\s+/)[0] || scenario.patient.name;
        const effectiveSeed =
          seedMessages.length > 0
            ? seedMessages
            : [
                {
                  role: "patient" as const,
                  text: scenario.patient.opening,
                  t: 0,
                },
              ];

        const turnsToSeed = effectiveSeed.map((m) => ({
          role: m.role === "student" ? "user" : "model",
          parts: [{ text: m.text }],
        }));

        if (turnsToSeed[0]?.role === "model") {
          turnsToSeed.unshift({
            role: "user",
            parts: [
              {
                text: `Hi ${firstName}, thanks for coming into the clinic today. What brings you in?`,
              },
            ],
          });
        }

        session.sendClientContent({
          turns: turnsToSeed,
          turnComplete: false,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus("error");
      }
    },
    [clearPlaybackQueue, disconnect, enqueuePcm24k, flushStudentTranscriptIfNeeded],
  );

  const startMicCapture = useCallback(async () => {
    if (!sessionRef.current || micActiveRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Ensure playback AudioContext is unlocked on user gesture
      if (!playbackCtxRef.current || playbackCtxRef.current.state === "closed") {
        const playCtx = new window.AudioContext({ sampleRate: 24000 });
        const analyser = playCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.connect(playCtx.destination);
        playbackCtxRef.current = playCtx;
        analyserRef.current = analyser;
      } else if (playbackCtxRef.current.state === "suspended") {
        await playbackCtxRef.current.resume();
      }

      const micCtx = new window.AudioContext({ sampleRate: 16000 });
      const source = micCtx.createMediaStreamSource(stream);
      const processor = micCtx.createScriptProcessor(4096, 1, 1);

      studentTranscriptBufRef.current = "";
      studentTurnDispatchedRef.current = false;
      micActiveRef.current = true;
      setIsMicStreaming(true);

      processor.onaudioprocess = (event) => {
        if (!micActiveRef.current || !sessionRef.current) return;
        const inputData = event.inputBuffer.getChannelData(0);

        const isPatientPlayingOrTail =
          activeSourcesRef.current.size > 0 ||
          performance.now() - lastPlaybackEndedAtRef.current < 400;

        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSq += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSq / inputData.length);

        // Suppress laptop speaker bleed while Jordan's voice is playing (unless loud barge-in)
        const effectiveInput =
          isPatientPlayingOrTail && rms < 0.08
            ? new Float32Array(inputData.length)
            : inputData;

        if (!isPatientPlayingOrTail ? rms > 0.008 : rms >= 0.08) {
          awaitingModelReplyRef.current = true;
        }

        const base64Audio = float32ToBase64Pcm16(
          effectiveInput,
          micCtx.sampleRate,
          16000,
        );
        sessionRef.current.sendRealtimeInput({
          audio: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      };

      source.connect(processor);
      processor.connect(micCtx.destination);

      micStreamRef.current = stream;
      micCtxRef.current = micCtx;
      micProcessorRef.current = processor;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Microphone permission denied";
      setError(msg);
      micActiveRef.current = false;
      setIsMicStreaming(false);
    }
  }, []);

  /**
   * Injects updated engine state & unlocked disclosures mid-session without triggering a turn.
   */
  const injectEngineStatePrompt = useCallback((directorCue: string) => {
    if (!sessionRef.current) return;
    try {
      sessionRef.current.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              {
                text: directorCue,
              },
            ],
          },
        ],
        turnComplete: false,
      });
    } catch {
      // Ignore if socket closed
    }
  }, []);

  /**
   * Sends a pre-classified student text message (e.g. typed input or Hint click while Live Voice
   * is active) after injecting the updated engine prompt so Jordan speaks the reply in native audio!
   */
  const sendTextForVoiceReply = useCallback(
    (directorCue: string, studentText: string) => {
      if (!sessionRef.current) return false;
      try {
        // Prevent inputTranscription callback from re-triggering duplicate classification
        studentTurnDispatchedRef.current = true;
        recoveryAttemptedRef.current = false;
        awaitingModelReplyRef.current = true;
        studentTranscriptBufRef.current = "";
        patientTranscriptBufRef.current = "";

        sessionRef.current.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [{ text: directorCue }],
            },
          ],
          turnComplete: false,
        });
        sessionRef.current.sendRealtimeInput({ text: studentText });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      disconnect();
      if (playbackCtxRef.current && playbackCtxRef.current.state !== "closed") {
        void playbackCtxRef.current.close();
      }
    };
  }, [disconnect]);

  return {
    status,
    error,
    isMicStreaming,
    isSpeaking,
    audioLevel,
    liveInputPreview,
    connect,
    disconnect,
    startMicCapture,
    stopMicCapture,
    injectEngineStatePrompt,
    sendTextForVoiceReply,
  };
}
