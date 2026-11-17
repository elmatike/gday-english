#!/bin/sh
# Genera la música de la sala con ElevenLabs (usa créditos de tu cuenta). Se corre a mano, solo cuando se quiere cambiar la música.
# Necesita haber iniciado sesión antes: npx -y @elevenlabs/cli@latest auth login
set -e
cd "$(dirname "$0")"
CLI="npx -y @elevenlabs/cli@latest"

$CLI music compose -o cafe.mp3 --json '{"model_id":"music_v2_5","force_instrumental":true,"music_length_ms":75000,"prompt":"Instrumental seamless loop for a cozy pixel-art cafe in a video game. Laid-back jazzy lounge groove at 88 BPM in A minor with light swing: warm walking upright bass, mellow Rhodes electric piano chords on the off-beats, a slightly warbly detuned vintage synth lead with tape wobble, soft brushed drums, subtle vinyl warmth. Hypnotic, playful card-table casino vibe, relaxing background music that does not distract from conversation. Same energy from start to end so it loops. No vocals."}'
echo "cafe.mp3 listo"

$CLI music compose -o beach.mp3 --json '{"model_id":"music_v2_5","force_instrumental":true,"music_length_ms":75000,"prompt":"Instrumental seamless loop for a sunny pixel-art beach in a video game. Breezy, upbeat jazzy groove at 98 BPM in A minor with a light swing: bouncy walking bass, bright electric piano and marimba chords, a warbly detuned vintage synth lead with gentle tape wobble, light shaker and soft drums, subtle surf-guitar twang. Hypnotic, playful card-table casino vibe meets summer surf, relaxing background music for chatting. Same energy from start to end so it loops. No vocals."}'
echo "beach.mp3 listo"
ls -la *.mp3
