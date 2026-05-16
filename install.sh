#!/usr/bin/env sh
set -eu

REPO="https://github.com/muneebhashone/streamscribe.git"
PKG="git+${REPO}"
BIN="streamscribe"

FORCE_MODE=0
VERSION_MODE=0

# Flags can be passed when the script is run directly:
#   sh install.sh --force
#   sh install.sh --version
# Or via env vars when piped via `curl ... | sh`:
#   STREAMSCRIBE_FORCE=1 curl -fsSL <url> | sh
#   STREAMSCRIBE_VERSION=1 curl -fsSL <url> | sh
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE_MODE=1 ;;
    --version|-v) VERSION_MODE=1 ;;
  esac
done
if [ "${STREAMSCRIBE_FORCE:-}" = "1" ]; then FORCE_MODE=1; fi
if [ "${STREAMSCRIBE_VERSION:-}" = "1" ]; then VERSION_MODE=1; fi

have() {
  command -v "$1" >/dev/null 2>&1
}

shell_quote() {
  # POSIX single-quote escaping for writing env vars to shell profiles.
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\''/g")"
}

get_installed_version() {
  if ! have streamscribe; then
    printf ''
    return
  fi
  v="$(streamscribe --version 2>/dev/null | tr -d '\r\n' || true)"
  case "$v" in
    ''|*"Unknown command"*) printf '' ;;
    *) printf '%s' "$v" ;;
  esac
}

remove_streamscribe() {
  echo "Force mode: removing existing streamscribe installation..."
  bun pm uninstall -g '@muneebhashone/streamscribe' >/dev/null 2>&1 || true
  bun_bin="${HOME}/.bun/bin"
  if [ -d "$bun_bin" ]; then
    for name in streamscribe mic-audio-capture chrome-mic-stt audio-recorder; do
      if [ -e "$bun_bin/$name" ] || [ -L "$bun_bin/$name" ]; then
        rm -f "$bun_bin/$name" 2>/dev/null || true
      fi
    done
  fi
  # Clear bun's git cache for this package so `bun install -g` refetches
  # main instead of resolving to a stale commit.
  bun_cache="${HOME}/.bun/install/cache"
  if [ -d "$bun_cache" ]; then
    find "$bun_cache" -maxdepth 1 -type d -name '*streamscribe*' -exec rm -rf {} + 2>/dev/null || true
  fi
  echo "Removed."
}

ensure_bun() {
  if ! have bun; then
    cat >&2 <<'MSG'
Bun is required but was not found on PATH.
Install Bun first: https://bun.sh/docs/installation
Then rerun this installer.
MSG
    exit 1
  fi
}

install_ffmpeg_package() {
  echo "FFmpeg/FFplay were not both found on PATH. Trying to install FFmpeg..."

  if have brew; then
    brew install ffmpeg
  elif have apt-get; then
    if [ "$(id -u)" -eq 0 ]; then
      apt-get update
      apt-get install -y ffmpeg
    elif have sudo; then
      sudo apt-get update
      sudo apt-get install -y ffmpeg
    else
      echo "sudo is required to install FFmpeg with apt-get." >&2
      return 1
    fi
  elif have dnf; then
    if [ "$(id -u)" -eq 0 ]; then dnf install -y ffmpeg; else sudo dnf install -y ffmpeg; fi
  elif have yum; then
    if [ "$(id -u)" -eq 0 ]; then yum install -y ffmpeg; else sudo yum install -y ffmpeg; fi
  elif have pacman; then
    if [ "$(id -u)" -eq 0 ]; then pacman -Sy --noconfirm ffmpeg; else sudo pacman -Sy --noconfirm ffmpeg; fi
  else
    cat >&2 <<'MSG'
Could not find a supported package manager to install FFmpeg automatically.
Install FFmpeg manually, then make sure both ffmpeg and ffplay are on PATH:
  https://ffmpeg.org/download.html
MSG
    return 1
  fi
}

ensure_media_tools() {
  if have ffmpeg && have ffplay; then
    echo "Found ffmpeg and ffplay on PATH."
    return 0
  fi

  install_ffmpeg_package || true

  if have ffmpeg && have ffplay; then
    echo "FFmpeg/FFplay setup complete."
  else
    cat >&2 <<'MSG'
Warning: ffmpeg and/or ffplay are still not on PATH.
StreamScribe can install, but record/live monitoring will need FFmpeg and FFplay.
MSG
  fi
}

profile_for_shell() {
  case "${SHELL:-}" in
    */zsh) printf '%s\n' "$HOME/.zshrc" ;;
    */bash) printf '%s\n' "$HOME/.bashrc" ;;
    *) printf '%s\n' "$HOME/.profile" ;;
  esac
}

save_deepgram_key() {
  key="$1"
  profile="$(profile_for_shell)"
  mkdir -p "$(dirname "$profile")"
  {
    printf '\n# StreamScribe Deepgram API key\n'
    printf 'export DEEPGRAM_API_KEY=%s\n' "$(shell_quote "$key")"
  } >> "$profile"
  export DEEPGRAM_API_KEY="$key"
  echo "Saved DEEPGRAM_API_KEY to $profile. Restart your shell or run: . \"$profile\""
}

ensure_deepgram_key() {
  if [ -n "${DEEPGRAM_API_KEY:-}" ]; then
    echo "Found DEEPGRAM_API_KEY in the environment."
    return 0
  fi

  echo "DEEPGRAM_API_KEY was not found in the environment."
  if [ -r /dev/tty ]; then
    printf 'Enter your Deepgram API key to save for StreamScribe (leave blank to skip): ' >/dev/tty
    IFS= read -r DEEPGRAM_API_KEY_INPUT </dev/tty || DEEPGRAM_API_KEY_INPUT=""
    if [ -n "$DEEPGRAM_API_KEY_INPUT" ]; then
      save_deepgram_key "$DEEPGRAM_API_KEY_INPUT"
    else
      echo "Skipped Deepgram API key setup. Set DEEPGRAM_API_KEY before using live mode."
    fi
  else
    echo "No interactive terminal is available, so the installer cannot prompt for a Deepgram API key."
    echo "Set DEEPGRAM_API_KEY before using live mode."
  fi
}

# --- main flow ---

if [ "$VERSION_MODE" -eq 1 ]; then
  installed="$(get_installed_version)"
  if [ -n "$installed" ]; then
    echo "streamscribe installed: $installed"
  else
    echo "streamscribe is not installed."
  fi
  exit 0
fi

ensure_bun
ensure_media_tools
ensure_deepgram_key

if [ "$FORCE_MODE" -eq 1 ]; then
  remove_streamscribe
fi

existing="$(get_installed_version)"
if [ -n "$existing" ] && [ "$FORCE_MODE" -ne 1 ]; then
  echo "streamscribe is already installed (version $existing). Re-running 'bun install -g' to fetch the latest..."
fi

echo "Installing streamscribe globally with Bun..."
bun install -g "$PKG"

echo
echo "Installed. Try:"
echo "  $BIN help"
echo "  $BIN live"
echo "  $BIN --version"
echo
echo "Requirements: ffmpeg/ffplay on PATH and DEEPGRAM_API_KEY for live mode."
