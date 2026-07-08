#!/usr/bin/env python3
"""Synthesize the AI voiceover narration for the promo video.

Uses Piper TTS (en_US-ryan-high) to generate one WAV per slide so each
line can be aligned to its slide in the final mix.
"""

import pathlib
import subprocess
import wave

ROOT = pathlib.Path(__file__).resolve().parent
VOICE = ROOT / "assets" / "voices" / "en_US-ryan-high.onnx"
OUT_DIR = ROOT / "assets" / "voiceover"

# (filename, start time in ms within the video, length scale, text)
LINES = [
    ("vo1", 500, 1.05, "Need to sell your house fast?"),
    ("vo2", 5000, 1.0, "We buy houses as-is. Any condition. Any situation."),
    ("vo3", 8800, 0.95, "Get a fair cash offer in twenty four hours. No fees. No commissions."),
    ("vo4", 14000, 1.0, "And close on your timeline, in as little as seven days."),
    ("vo5", 17700, 1.0, "Contact Twin Home Buyer today, for your free cash offer."),
]


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, start_ms, scale, text in LINES:
        out = OUT_DIR / f"{name}.wav"
        subprocess.run(
            ["piper", "--model", str(VOICE), "--output_file", str(out),
             "--length-scale", str(scale), "--sentence-silence", "0.2"],
            input=text.encode(), check=True,
        )
        with wave.open(str(out)) as w:
            dur = w.getnframes() / w.getframerate()
        print(f"{name}: starts {start_ms}ms, ends {start_ms/1000 + dur:.2f}s  \"{text}\"")


if __name__ == "__main__":
    main()
