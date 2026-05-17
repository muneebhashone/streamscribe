#!/usr/bin/env bash
# Run streamscribe record on Linux end-to-end. Uses real PulseAudio sources
# discovered at runtime, runs for ~3 seconds, then verifies a WAV was produced.
set -eu
export PATH="$HOME/.bun/bin:$PATH"

cd /tmp/sslinux/streamscribe

# Discover a monitor and a real input source from real pulse output.
PULSE_OUT="$(ffmpeg -hide_banner -sources pulse 2>&1 || true)"
MONITOR="$(printf '%s\n' "$PULSE_OUT" | awk '/\.monitor / {print $1; exit}')"
MIC="$(printf '%s\n' "$PULSE_OUT" | awk '/^\* / {print $2; exit}')"
if [ -z "$MONITOR" ]; then MONITOR="$(printf '%s\n' "$PULSE_OUT" | awk '/[a-zA-Z]\.monitor/ {print $1; exit}')"; fi
echo "Using monitor: $MONITOR"
echo "Using mic    : $MIC"

if [ -z "$MONITOR" ] || [ -z "$MIC" ]; then
  echo "Could not discover both a monitor source and an input source. Aborting test."
  exit 1
fi

# Override config so streamscribe doesn't prompt the picker.
CFG=/tmp/sslinux/recorder.config.json
cat > "$CFG" <<JSON
{
  "ffmpegPath": "ffmpeg",
  "outputDir": "/tmp/sslinux/recordings",
  "sampleRate": 48000,
  "monitor": { "enabled": false, "ffplayPath": "ffplay", "volume": 100 },
  "deepgram": { "apiKeyEnv": "DEEPGRAM_API_KEY", "sttModel": "nova-3", "sttSampleRate": 16000, "interimResults": true, "endpointing": 300, "punctuate": true, "smartFormat": true, "printInterim": false, "ttsEnabled": false, "ttsModel": "aura-2-thalia-en", "ttsSampleRate": 24000, "ttsEncoding": "linear16", "ttsContainer": "wav", "speakChannelNames": false, "ffplayPath": "ffplay", "debug": false },
  "browser": { "label": "playback", "backend": "pulse", "device": "$MONITOR", "channel": "left", "ttsName": "playback" },
  "mic":     { "label": "mic",      "backend": "pulse", "device": "$MIC",     "channel": "right", "ttsName": "microphone" }
}
JSON

export STREAMSCRIBE_CONFIG="$CFG"

# Run record for 3 seconds, then send 'q' on stdin to stop cleanly.
mkdir -p /tmp/sslinux/recordings
echo '--- streamscribe record (3s) ---'
( sleep 3; printf 'q' ) | timeout 12s bun src/cli.ts record 2>&1 | tail -25 || true

echo ''
echo '--- output files ---'
ls -la /tmp/sslinux/recordings/ 2>/dev/null | tail -5
LATEST="$(ls -1t /tmp/sslinux/recordings/*.wav 2>/dev/null | head -1 || true)"
if [ -n "$LATEST" ] && [ -s "$LATEST" ]; then
  echo "WAV produced: $LATEST"
  echo "Size: $(stat -c %s "$LATEST") bytes"
  file "$LATEST" 2>/dev/null || true
  exit 0
else
  echo "No WAV produced."
  exit 1
fi
