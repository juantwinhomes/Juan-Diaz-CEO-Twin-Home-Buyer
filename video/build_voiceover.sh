#!/usr/bin/env bash
# Mix the AI voiceover narration into the promo video:
# reuses the video stream from output/twin-home-buyer-promo.mp4, ducks the
# music, and overlays the five Piper TTS lines at their slide timestamps.
set -euo pipefail
cd "$(dirname "$0")"

python3 make_voiceover.py

VO="volume=1.35,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo"

ffmpeg -y \
  -i output/twin-home-buyer-promo.mp4 \
  -i assets/voiceover/vo1.wav \
  -i assets/voiceover/vo2.wav \
  -i assets/voiceover/vo3.wav \
  -i assets/voiceover/vo4.wav \
  -i assets/voiceover/vo5.wav \
  -filter_complex "\
[0:a]volume=0.4[m];\
[1:a]${VO},adelay=500|500[a1];\
[2:a]${VO},adelay=5000|5000[a2];\
[3:a]${VO},adelay=8800|8800[a3];\
[4:a]${VO},adelay=14000|14000[a4];\
[5:a]${VO},adelay=17700|17700[a5];\
[m][a1][a2][a3][a4][a5]amix=inputs=6:duration=first:normalize=0[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 160k \
  output/twin-home-buyer-promo-voiceover.mp4

echo "Done: output/twin-home-buyer-promo-voiceover.mp4"
