#!/usr/bin/env python3
"""Generate a soft ambient music bed for the promo video.

Pure-Python WAV synthesis (no numpy): a warm four-chord pad with slight
stereo detune, soft attack/release per chord, and a final fade-out.
"""

import math
import struct
import wave
import pathlib

SR = 44100
CHORD_SECONDS = 5.45
TOTAL_SECONDS = 21.8
FADE_OUT = 2.5
GAIN = 0.16

# F(add9) -> C -> Am7 -> G : warm, hopeful progression
CHORDS = [
    [174.61, 220.00, 261.63, 392.00],   # F A C G
    [130.81, 164.81, 196.00, 329.63],   # C E G E'
    [110.00, 130.81, 164.81, 196.00],   # A C E G
    [98.00, 123.47, 146.83, 196.00],    # G B D G'
]


def synth():
    n_total = int(SR * TOTAL_SECONDS)
    left = [0.0] * n_total
    right = [0.0] * n_total

    for ci, chord in enumerate(CHORDS):
        start = int(ci * CHORD_SECONDS * SR)
        length = int(CHORD_SECONDS * SR)
        attack = int(0.9 * SR)
        release = int(1.2 * SR)
        for note in chord:
            for i in range(length):
                idx = start + i
                if idx >= n_total:
                    break
                env = 1.0
                if i < attack:
                    env = i / attack
                elif i > length - release:
                    env = max(0.0, (length - i) / release)
                t = idx / SR
                # fundamental + quiet octave, slightly detuned per channel
                l = math.sin(2 * math.pi * note * 0.999 * t) + 0.35 * math.sin(2 * math.pi * note * 1.998 * t)
                r = math.sin(2 * math.pi * note * 1.001 * t) + 0.35 * math.sin(2 * math.pi * note * 2.002 * t)
                # slow shimmer
                trem = 0.9 + 0.1 * math.sin(2 * math.pi * 0.25 * t + ci)
                left[idx] += l * env * trem
                right[idx] += r * env * trem

    # normalize-ish (4 notes * 1.35 peak) then master fade in/out
    fade_out_n = int(FADE_OUT * SR)
    fade_in_n = int(0.8 * SR)
    frames = bytearray()
    for i in range(n_total):
        master = GAIN / (4 * 1.35)
        if i < fade_in_n:
            master *= i / fade_in_n
        if i > n_total - fade_out_n:
            master *= max(0.0, (n_total - i) / fade_out_n)
        ls = max(-1.0, min(1.0, left[i] * master))
        rs = max(-1.0, min(1.0, right[i] * master))
        frames += struct.pack("<hh", int(ls * 32767), int(rs * 32767))
    return bytes(frames)


def main():
    out = pathlib.Path(__file__).resolve().parent / "assets" / "music.wav"
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(synth())
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
