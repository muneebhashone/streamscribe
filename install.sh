#!/usr/bin/env sh
set -eu

REPO="https://github.com/muneebhashone/streamscribe.git"
PKG="git+${REPO}#main"
GITHUB_SPEC="github:muneebhashone/streamscribe"
MAIN_COMMIT_API="https://api.github.com/repos/muneebhashone/streamscribe/commits/main"
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

clear_streamscribe_cache() {
  # Bun can reuse cached git package resolutions for global installs. Clear only
  # StreamScribe-looking cache entries before each install so reruns update.
  bun_cache="${HOME}/.bun/install/cache"
  if [ -d "$bun_cache" ]; then
    find "$bun_cache" -maxdepth 1 -type d \( -name '*streamscribe*' -o -name '*muneebhashone*' \) -exec rm -rf {} + 2>/dev/null || true
  fi
}

uninstall_streamscribe_package() {
  bun remove -g '@muneebhashone/streamscribe' >/dev/null 2>&1 || true
}

resolve_streamscribe_package() {
  sha=""
  if have git; then
    sha="$(git ls-remote "$REPO" refs/heads/main 2>/dev/null | awk '{print $1}' || true)"
  fi
  if [ -z "$sha" ] && have curl; then
    sha="$(curl -fsSL "$MAIN_COMMIT_API" 2>/dev/null | sed -n 's/^[[:space:]]*"sha":[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' | head -n 1 || true)"
  fi
  case "$sha" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])
      printf '%s#%s' "$GITHUB_SPEC" "$sha"
      ;;
    *)
      printf '%s' "$PKG"
      ;;
  esac
}

install_streamscribe_package() {
  resolved_pkg="$(resolve_streamscribe_package)"
  install_cwd="${TMPDIR:-/tmp}"
  if [ ! -d "$install_cwd" ]; then
    install_cwd="$HOME"
  fi
  (
    cd "$install_cwd"
    bun install -g --force --no-cache "$resolved_pkg"
  )
}

remove_streamscribe() {
  echo "Force mode: removing existing streamscribe installation..."
  uninstall_streamscribe_package
  bun_bin="${HOME}/.bun/bin"
  if [ -d "$bun_bin" ]; then
    for name in streamscribe mic-audio-capture chrome-mic-stt audio-recorder; do
      if [ -e "$bun_bin/$name" ] || [ -L "$bun_bin/$name" ]; then
        rm -f "$bun_bin/$name" 2>/dev/null || true
      fi
    done
  fi
  clear_streamscribe_cache
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

current_os() {
  case "$(uname -s 2>/dev/null)" in
    Darwin) printf 'macos' ;;
    Linux) printf 'linux' ;;
    *) printf 'other' ;;
  esac
}

ffmpeg_has_avfoundation_blackhole() {
  if ! have ffmpeg; then return 1; fi
  ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1 | grep -E -i 'BlackHole|Loopback Audio|Soundflower|Multi-Output Device' >/dev/null 2>&1
}

install_blackhole_macos() {
  if ! have brew; then
    cat >&2 <<'MSG'
Homebrew was not found, so BlackHole can't be installed automatically.
Install Homebrew first: https://brew.sh
Or install BlackHole manually: https://existential.audio/blackhole/
MSG
    return 1
  fi
  echo "Installing BlackHole 2ch via Homebrew (you may be prompted for your password)..."
  brew install blackhole-2ch
}

ensure_macos_loopback() {
  echo "Checking for a macOS system-audio loopback driver..."
  if ffmpeg_has_avfoundation_blackhole; then
    echo "Found a loopback driver (BlackHole / Loopback Audio / Soundflower / Multi-Output Device)."
    return 0
  fi
  echo ""
  echo "No macOS loopback driver detected."
  echo "StreamScribe needs one to capture system audio (any app)."
  echo "Recommended: BlackHole 2ch (free, open source)."
  if [ -r /dev/tty ]; then
    printf 'Install BlackHole 2ch now via Homebrew? [Y/n]: ' >/dev/tty
    IFS= read -r reply </dev/tty || reply=""
  else
    reply=""
  fi
  case "$reply" in
    n|N|no|NO|No)
      cat <<'MSG'
Skipped. Install one manually before using live mode:
  https://existential.audio/blackhole/ (free)
  https://rogueamoeba.com/loopback/    (paid)
After installing, create a Multi-Output Device in Audio MIDI Setup so you
can both hear audio and have streamscribe capture it.
MSG
      ;;
    *)
      install_blackhole_macos || true
      cat <<'MSG'

Next step: open Audio MIDI Setup and create a Multi-Output Device that
includes BOTH your headset/speakers AND BlackHole 2ch. Then set that
Multi-Output Device as the macOS System Output. See:
  https://github.com/ExistentialAudio/BlackHole/wiki/Multi-Output-Device
MSG
      ;;
  esac
}

pulse_is_running() {
  # PulseAudio (or PipeWire-Pulse) responds to pactl info if a server is up.
  if have pactl; then
    pactl info >/dev/null 2>&1 && return 0
  fi
  if have pulseaudio; then
    pulseaudio --check >/dev/null 2>&1 && return 0
  fi
  # ffmpeg -sources pulse fails when no pulse server is reachable.
  if have ffmpeg; then
    ffmpeg -hide_banner -sources pulse 2>&1 | grep -E -i 'Auto-detected sources for pulse' >/dev/null 2>&1 && return 0
  fi
  return 1
}

ensure_linux_loopback() {
  echo "Checking for PulseAudio (or PipeWire-Pulse) on Linux..."
  if pulse_is_running; then
    echo "PulseAudio server is reachable. Monitor sources will be used for loopback."
    return 0
  fi
  cat >&2 <<'MSG'

No reachable PulseAudio server detected.
Linux uses PulseAudio monitor sources for system-audio loopback. Install
PulseAudio (or PipeWire with the Pulse compatibility layer) and make sure
it is running, then re-run streamscribe.

Ubuntu/Debian:
  sudo apt-get install -y pulseaudio   # or: sudo apt-get install -y pipewire-pulse
Fedora:
  sudo dnf install -y pulseaudio       # or: sudo dnf install -y pipewire-pulseaudio
Arch:
  sudo pacman -Sy --noconfirm pulseaudio

After installing, log out and back in (or run `systemctl --user start pulseaudio`).
MSG
}

ensure_loopback_driver() {
  case "$(current_os)" in
    macos) ensure_macos_loopback ;;
    linux) ensure_linux_loopback ;;
    *) ;;
  esac
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
ensure_loopback_driver
ensure_deepgram_key

if [ "$FORCE_MODE" -eq 1 ]; then
  remove_streamscribe
fi

existing="$(get_installed_version)"
if [ -n "$existing" ] && [ "$FORCE_MODE" -ne 1 ]; then
  echo "streamscribe is already installed (version $existing). Updating from main..."
  uninstall_streamscribe_package
fi

clear_streamscribe_cache
echo "Installing streamscribe globally with Bun..."
install_streamscribe_package

echo
echo "Installed. Try:"
echo "  $BIN help"
echo "  $BIN live"
echo "  $BIN --version"
echo
echo "Requirements: ffmpeg/ffplay on PATH and DEEPGRAM_API_KEY for live mode."
