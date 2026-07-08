#!/usr/bin/env bash
# Build the Twin Home Buyer promo video:
#   1. render_slides.py  -> frames/slide{1..5}.png (1620x2880)
#   2. make_audio.py     -> assets/music.wav
#   3. ffmpeg: Ken Burns motion per slide + crossfades + music -> output MP4
set -euo pipefail
cd "$(dirname "$0")"

python3 render_slides.py
python3 make_audio.py

FPS=30
DUR=5          # seconds per slide
FADE=0.8       # crossfade duration
FRAMES=$((DUR * FPS))

# Alternating slow zoom-in / zoom-out for each slide (Ken Burns).
ZI="zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${FRAMES}:s=1080x1920:fps=${FPS}"
ZO="zoompan=z='1.12-0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${FRAMES}:s=1080x1920:fps=${FPS}"

ffmpeg -y \
  -loop 1 -t $DUR -i frames/slide1.png \
  -loop 1 -t $DUR -i frames/slide2.png \
  -loop 1 -t $DUR -i frames/slide3.png \
  -loop 1 -t $DUR -i frames/slide4.png \
  -loop 1 -t $DUR -i frames/slide5.png \
  -i assets/music.wav \
  -filter_complex "\
[0:v]${ZI},setsar=1[v0];\
[1:v]${ZO},setsar=1[v1];\
[2:v]${ZI},setsar=1[v2];\
[3:v]${ZO},setsar=1[v3];\
[4:v]${ZI},setsar=1[v4];\
[v0][v1]xfade=transition=fade:duration=${FADE}:offset=4.2[x1];\
[x1][v2]xfade=transition=fade:duration=${FADE}:offset=8.4[x2];\
[x2][v3]xfade=transition=fade:duration=${FADE}:offset=12.6[x3];\
[x3][v4]xfade=transition=fade:duration=${FADE}:offset=16.8,format=yuv420p[vout]" \
  -map "[vout]" -map 5:a \
  -c:v libx264 -crf 18 -preset slow -r $FPS \
  -c:a aac -b:a 160k \
  -shortest -movflags +faststart \
  output/twin-home-buyer-promo.mp4

echo "Done: output/twin-home-buyer-promo.mp4"
