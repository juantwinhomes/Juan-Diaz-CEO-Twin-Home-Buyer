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
import { COMPANY } from "@/lib/prompts";

type Turn = { role: "agent" | "candidate"; text: string; ts: number };
type Stage = "consent" | "miccheck" | "connecting" | "live" | "uploading" | "done" | "error";

const HARD_CAP_MS = 8 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export default function InterviewClient({
  token,
  candidateName,
  roleApplied,
  attemptsUsed = 0,
}: {
  token: string;
  candidateName: string;
  roleApplied: string;
  attemptsUsed?: number;
}) {
  const [stage, setStage] = useState<Stage>("consent");
  const [error, setError] = useState("");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micOk, setMicOk] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const micCheckCleanupRef = useRef<() => void>(() => {});

  const transcriptRef = useRef<Turn[]>([]);
  const sessionRef = useRef<any>(null);
  const interviewIdRef = useRef<string>("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cleanupRef = useRef<() => void>(() => {});
  const endedRef = useRef(false);
  // populated when the Live session errors/closes abnormally, so the final
  // screen can show WHY instead of failing silently
  const failReasonRef = useRef<string>("");
  const flushTurnsRef = useRef<() => void>(() => {});

  // Consent accepted → open the mic and show a live level meter so the
  // candidate can SEE their voice registering before anything counts.
  async function beginMicCheck() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setMicLevel(level);
        if (level > 0.25) setMicOk(true);
        raf = requestAnimationFrame(tick);
      };
      tick();
      micCheckCleanupRef.current = () => {
        cancelAnimationFrame(raf);
        try { src.disconnect(); ctx.close(); } catch {}
      };
      setStage("miccheck");
    } catch {
      setError("Microphone access was blocked. Please allow the microphone and reload this page.");
      setStage("error");
    }
  }

  async function start() {
    micCheckCleanupRef.current(); // stop the meter; keep the stream
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

      // 2. Mic (already granted during mic check)
      const stream = streamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));

      // 3. Playback pipeline for model audio (24kHz PCM), plus a mix bus so
      // the recording captures BOTH sides of the conversation
      const playCtx = new AudioContext({ sampleRate: 24000 });
      const mixDest = playCtx.createMediaStreamDestination();
      // mic → mix bus only (NOT to speakers — that would echo)
      playCtx.createMediaStreamSource(stream).connect(mixDest);

      // Record the mixed conversation for admin playback
      const recorder = new MediaRecorder(mixDest.stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.start(1000);
      recorderRef.current = recorder;

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
        src.connect(mixDest); // AI voice → recording too
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
      // flush any partial turn buffers — called on turn completion AND when
      // the session ends, so a mid-goodbye "End" click doesn't lose words
      flushTurnsRef.current = () => {
        pushTurn("candidate", currentCandidate);
        pushTurn("agent", currentAgent);
        currentAgent = "";
        currentCandidate = "";
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
              const agentSaidComplete = currentAgent.toUpperCase().includes("INTERVIEW COMPLETE");
              flushTurnsRef.current();
              // agent signals the scripted end of the interview
              if (agentSaidComplete) {
                setTimeout(() => endSession(true), 4000); // let the goodbye finish playing
              }
            }
          },
          onerror: (e: any) => {
            console.error("Live session error:", e);
            failReasonRef.current = e?.message || "connection error";
            endSession(false);
          },
          onclose: (e: any) => {
            console.error("Live session closed:", e?.code, e?.reason);
            if (!failReasonRef.current && e?.reason)
              failReasonRef.current = `closed (${e.code}): ${e.reason}`;
            endSession(false);
          },
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
    flushTurnsRef.current();
    // If the interviewer already delivered its closing line, this interview
    // IS complete — even if the candidate clicked End during the goodbye.
    if (!completed) {
      completed = transcriptRef.current.some(
        (t) => t.role === "agent" && t.text.toUpperCase().includes("INTERVIEW COMPLETE")
      );
    }
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
        <h1 style={{ fontSize: 24 }}>{COMPANY} — Voice Interview</h1>
        <p>Hi {candidateName}! This is a short (~5 minute) spoken interview for the <strong>{roleApplied}</strong> role. You&apos;ll talk with our AI interviewer using your microphone.</p>
        {attemptsUsed > 0 && (
          <p style={{ background: "#eff6ff", padding: 10, borderRadius: 8, fontSize: 14 }}>
            Retake — attempt {attemptsUsed + 1} of {MAX_ATTEMPTS}. The questions will be different this time.
          </p>
        )}
        <p style={{ background: "#fff7ed", padding: 12, borderRadius: 8, fontSize: 15 }}>
          <strong>This interview is recorded</strong> (audio and transcript) and reviewed by the {COMPANY} hiring team. By clicking below, you consent to the recording.
        </p>
        <p style={{ fontSize: 14, color: "#666" }}>Find a quiet spot. You get up to {MAX_ATTEMPTS} attempts on this link.</p>
        <button style={btn} onClick={beginMicCheck}>I consent — continue to mic check</button>
      </main>
    );

  if (stage === "miccheck")
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 22 }}>Quick mic check</h1>
        <p>Say something out loud — try <em>&quot;test, one two three&quot;</em> — and watch the bar move:</p>
        <div style={{ height: 18, background: "#e5e7eb", borderRadius: 9, overflow: "hidden", margin: "16px 0" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(micLevel * 100)}%`,
              background: micOk ? "#22c55e" : "#1a56db",
              transition: "width .08s linear",
            }}
          />
        </div>
        <p style={{ fontSize: 14, color: micOk ? "#15803d" : "#666" }}>
          {micOk ? "✓ We can hear you — you're good to go." : "Waiting to hear you… if the bar never moves, check your mic settings and reload."}
        </p>
        <button style={{ ...btn, opacity: micOk ? 1 : 0.5 }} disabled={!micOk} onClick={start}>
          Start my interview
        </button>
      </main>
    );

  if (stage === "connecting") return <main style={wrap}><h1>Connecting…</h1><p>Your interviewer is picking up…</p></main>;

  if (stage === "live")
    return (
      <main style={wrap}>
        <div style={{ width: 96, height: 96, margin: "24px auto", borderRadius: "50%", background: agentSpeaking ? "#1a56db" : "#22c55e", transition: "background .3s", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32 }}>
          {agentSpeaking ? "🔊" : "🎙️"}
        </div>
        <h1 style={{ fontSize: 20 }}>{agentSpeaking ? "Interviewer speaking…" : "Your turn — speak naturally"}</h1>
        <p style={{ color: "#666" }}>The interview ends automatically. Max 8 minutes.</p>
        <button
          style={{ ...btn, background: "#6b7280" }}
          onClick={() => {
            if (window.confirm("End the interview now? If it isn't finished, this attempt may not be scoreable."))
              endSession(false);
          }}
        >
          End interview early
        </button>
      </main>
    );

  if (stage === "uploading") return <main style={wrap}><h1>Saving your interview…</h1><p>Don&apos;t close this tab.</p></main>;

  if (stage === "done") {
    // session died before any conversation happened — surface the reason
    if (failReasonRef.current && transcriptRef.current.length === 0)
      return (
        <main style={wrap}>
          <h1>Connection problem</h1>
          <p>The interview could not start. Please share this with {COMPANY}:</p>
          <p style={{ color: "#c00", fontSize: 14, background: "#fff", padding: 10, borderRadius: 6, wordBreak: "break-all" }}>
            {failReasonRef.current}
          </p>
        </main>
      );
    const attemptsAfterThis = attemptsUsed + 1;
    const retakesLeft = MAX_ATTEMPTS - attemptsAfterThis;
    return (
      <main style={wrap}>
        <h1>✅ All done, {candidateName}!</h1>
        <p>Your interview was submitted. The {COMPANY} team will review it and get back to you within a few days.</p>
        {retakesLeft > 0 && (
          <>
            <p style={{ fontSize: 14, color: "#666" }}>
              Not your best run? You may retake this interview {retakesLeft} more {retakesLeft === 1 ? "time" : "times"} — with different questions. The team sees all attempts.
            </p>
            <button style={{ ...btn, background: "#6b7280" }} onClick={() => window.location.reload()}>
              Retake interview ({retakesLeft} left)
            </button>
          </>
        )}
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1>Something went wrong</h1>
      <p style={{ color: "#c00" }}>{error}</p>
      <p>Please try the link again, or contact {COMPANY}.</p>
    </main>
  );
}
