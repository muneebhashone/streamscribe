#!/usr/bin/env sh
set -eu

REPO="https://github.com/muneebhashone/mic-and-audio-capture.git"
PKG="git+${REPO}"
BIN="mic-audio-capture"

if ! command -v bun >/dev/null 2>&1; then
  cat >&2 <<'MSG'
Bun is required but was not found on PATH.
Install Bun first: https://bun.sh/docs/installation
Then rerun this installer.
MSG
  exit 1
fi

echo "Installing mic-and-audio-capture globally with Bun..."
bun install -g "$PKG"

echo
echo "Installed. Try:"
echo "  $BIN help"
echo "  $BIN init-config"
echo "  $BIN devices"
echo "  $BIN live"
echo
echo "Requirements: FFmpeg/FFplay on PATH and DEEPGRAM_API_KEY for live mode."
