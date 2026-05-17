#!/usr/bin/env bash
# Stub uname so install.sh thinks it's on Darwin, then exercise the macOS
# loopback-driver branch. Useful as a sanity check from Linux or WSL when no
# real Mac is at hand — the actual brew install is skipped because brew is
# absent.
set -u
cd "$(dirname "$0")/.."

stubdir="$(mktemp -d)"
cat > "$stubdir/uname" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -s) echo Darwin ;;
  *)  echo Darwin themuneeb-mac 23.0.0 Darwin Kernel x86_64 ;;
esac
EOF
chmod +x "$stubdir/uname"
export PATH="$stubdir:$PATH"

# Pull helper definitions out of install.sh into a sourceable file.
helpers="$(mktemp)"
awk '
  /^have\(\) \{/                                { p=1 }
  /^current_os\(\) \{/                           { p=1 }
  /^ffmpeg_has_avfoundation_blackhole\(\) \{/    { p=1 }
  /^install_blackhole_macos\(\) \{/              { p=1 }
  /^ensure_macos_loopback\(\) \{/                { p=1 }
  /^pulse_is_running\(\) \{/                     { p=1 }
  /^ensure_linux_loopback\(\) \{/                { p=1 }
  /^ensure_loopback_driver\(\) \{/               { p=1 }
  p == 1 { print }
  p == 1 && /^\}$/ { p=0 }
' install.sh > "$helpers"

# shellcheck disable=SC1090
source "$helpers"

echo "current_os (with stubbed uname) -> $(current_os)"
echo ''
echo '--- ensure_loopback_driver (Darwin dispatch, no brew, no AVFoundation, no controlling tty) ---'
# `setsid` detaches from the controlling terminal so the [Y/n] prompt's
# `[ -r /dev/tty ]` check fails and the script takes the non-interactive path.
setsid -w bash -c "source \"$helpers\"; ensure_loopback_driver" < /dev/null 2>&1 || true
echo '--- (end of ensure_loopback_driver output) ---'

rm -rf "$stubdir" "$helpers"
