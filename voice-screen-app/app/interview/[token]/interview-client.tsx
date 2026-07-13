"use client";

// Candidate-facing interview flow:
// consent -> mic check -> live voice session with Gemini -> done.
//
// Audio in:  mic -> AudioContext(16kHz) -> PCM16 -> sendRealtimeInput
// Audio out: model PCM (24kHz) -> queued AudioBuffer playback
// Transcript: input/output transcription events accumulated locally,
//             uploaded with the mic recording (webm) on session end.

import { useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";

type Turn = { role: "agent" | "candidate"; text: string; ts: number };
type Stage = "consent" | "connecting" | "live" | "uploading" | "done" | "error";

const HARD_CAP_MS = 8 * 60 * 1000;

export default function InterviewClient({
  token,
  candidateName,
  roleApplied,
}: {
  token: string;
  candidateName: string;
  roleApplied: string;
}) {
  const [stage, setStage] = useState<Stage>("consent");
  const [error, setError] = useState("");
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const transcriptRef = useRef<Turn[]>([]);
  const sessionRef = useRef<any>(null);
  const interviewIdRef = useRef<string>("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cleanupRef = useRef<() => void>(() => {});
  const endedRef = useRef(false);

  async function start() {
    setStage("connecting");
    try {
      // 1. Log consent + get ephemeral token (API key stays server-side)
      const res = await fetch("/api/interviews/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not start the interview");
      }
      const { interviewId, ephemeralToken, model, systemPrompt } = await res.json();
      interviewIdRef.current = interviewId;

      // 2. Mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Record candidate audio for admin playback
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.start(1000);
      recorderRef.current = recorder;

      // 3. Playback pipeline for model audio (24kHz PCM)
      const playCtx = new AudioContext({ sampleRate: 24000 });
      let playhead = 0;
      function playPcm(base64: string) {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const pcm = new Int16Array(bytes.buffer);
        const buf = playCtx.createBuffer(1, pcm.length, 24000);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
        const src = playCtx.createBufferSource();
        src.buffer = buf;
        src.connect(playCtx.destination);
        playhead = Math.max(playhead, playCtx.currentTime) ;
        src.start(playhead);
        playhead += buf.duration;
        setAgentSpeaking(true);
        src.onended = () => {
          if (playCtx.currentTime >= playhead - 0.05) setAgentSpeaking(false);
        };
      }

      // 4. Connect to Gemini Live with the ephemeral token
      const ai = new GoogleGenAI({
        apiKey: ephemeralToken,
        httpOptions: { apiVersion: "v1alpha" },
      });

      let currentAgent = "";
      let currentCandidate = "";
      const pushTurn = (role: Turn["role"], text: string) => {
        const t = text.trim();
        if (t) transcriptRef.current.push({ role, text: t, ts: Date.now() });
      };

      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemPrompt,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (msg: any) => {
            const sc = msg.serverContent;
            if (!sc) return;
            // audio out
            for (const part of sc.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) playPcm(part.inlineData.data);
            }
            // transcriptions
            if (sc.outputTranscription?.text) currentAgent += sc.outputTranscription.text;
            if (sc.inputTranscription?.text) currentCandidate += sc.inputTranscription.text;
            if (sc.turnComplete) {
              pushTurn("candidate", currentCandidate);
              pushTurn("agent", currentAgent);
              // agent signals the scripted end of the interview
              if (currentAgent.toUpperCase().includes("INTERVIEW COMPLETE")) {
                setTimeout(() => endSession(true), 4000); // let the goodbye finish playing
              }
              currentAgent = "";
              currentCandidate = "";
            }
          },
          onerror: () => endSession(false),
          onclose: () => endSession(false),
        },
      });
      sessionRef.current = session;

      // 5. Stream mic audio as 16kHz PCM16
      const micCtx = new AudioContext({ sampleRate: 16000 });
      const src = micCtx.createMediaStreamSource(stream);
      const proc = micCtx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => {
        const f32 = e.inputBuffer.getChannelData(0);
        const i16 = new Int16Array(f32.length);
        for (let i = 0; i < f32.length; i++)
          i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
        let bin = "";
        const bytes = new Uint8Array(i16.buffer);
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        session.sendRealtimeInput({
          audio: { data: btoa(bin), mimeType: "audio/pcm;rate=16000" },
        });
      };
      src.connect(proc);
      proc.connect(micCtx.destination);

      // Hard cap
      const capTimer = setTimeout(() => endSession(true), HARD_CAP_MS);

      cleanupRef.current = () => {
        clearTimeout(capTimer);
        try { proc.disconnect(); src.disconnect(); } catch {}
        try { micCtx.close(); playCtx.close(); } catch {}
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        try { session.close(); } catch {}
      };

      setStage("live");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      setStage("error");
    }
  }

  async function endSession(completed: boolean) {
    if (endedRef.current) return;
    endedRef.current = true;
    setStage("uploading");
    cleanupRef.current();

    // finish the recording
    const recorder = recorderRef.current;
    const audioBlob: Blob | null = await new Promise((resolve) => {
      if (!recorder || recorder.state === "inactive")
        return resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: "audio/webm" }) : null);
      recorder.onstop = () =>
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: "audio/webm" }) : null);
      recorder.stop();
    });

    const form = new FormData();
    form.set("interviewId", interviewIdRef.current);
    form.set("transcript", JSON.stringify(transcriptRef.current));
    form.set("completed", String(completed));
    if (audioBlob) form.set("audio", audioBlob, "interview.webm");

    try {
      await fetch("/api/interviews/complete", { method: "POST", body: form });
    } catch {}
    setStage("done");
  }

  const wrap: React.CSSProperties = { maxWidth: 560, margin: "8vh auto", padding: 24, textAlign: "center" };
  const btn: React.CSSProperties = { padding: "12px 28px", fontSize: 16, borderRadius: 8, border: 0, background: "#1a56db", color: "#fff", cursor: "pointer" };

  if (stage === "consent")
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 24 }}>Twin Home Buyer — Voice Interview</h1>
        <p>Hi {candidateName}! This is a short (~5 minute) spoken interview for the <strong>{roleApplied}</strong> role. You&apos;ll talk with our AI interviewer using your microphone.</p>
        <p style={{ background: "#fff7ed", padding: 12, borderRadius: 8, fontSize: 15 }}>
          <strong>This interview is recorded</strong> (audio and transcript) and reviewed by the Twin Home Buyer hiring team. By clicking below, you consent to the recording.
        </p>
        <p style={{ fontSize: 14, color: "#666" }}>Find a quiet spot. The link works once.</p>
        <button style={btn} onClick={start}>I consent — start my interview</button>
      </main>
    );

  if (stage === "connecting") return <main style={wrap}><h1>Connecting…</h1><p>Allow microphone access when your browser asks.</p></main>;

  if (stage === "live")
    return (
      <main style={wrap}>
        <div style={{ width: 96, height: 96, margin: "24px auto", borderRadius: "50%", background: agentSpeaking ? "#1a56db" : "#22c55e", transition: "background .3s", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32 }}>
          {agentSpeaking ? "🔊" : "🎙️"}
        </div>
        <h1 style={{ fontSize: 20 }}>{agentSpeaking ? "Interviewer speaking…" : "Your turn — speak naturally"}</h1>
        <p style={{ color: "#666" }}>The interview ends automatically. Max 8 minutes.</p>
        <button style={{ ...btn, background: "#6b7280" }} onClick={() => endSession(false)}>End interview early</button>
      </main>
    );

  if (stage === "uploading") return <main style={wrap}><h1>Saving your interview…</h1><p>Don&apos;t close this tab.</p></main>;

  if (stage === "done")
    return (
      <main style={wrap}>
        <h1>✅ All done, {candidateName}!</h1>
        <p>Your interview was submitted. The Twin Home Buyer team will review it and get back to you within a few days.</p>
      </main>
    );

  return (
    <main style={wrap}>
      <h1>Something went wrong</h1>
      <p style={{ color: "#c00" }}>{error}</p>
      <p>Please try the link again, or contact Twin Home Buyer.</p>
    </main>
  );
}
