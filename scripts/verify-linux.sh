#!/usr/bin/env bash
# Verification harness: sources the new install.sh helpers on a real Linux box
# and prints what they would do. Used to confirm the cross-platform install
# script works without actually installing streamscribe.
set -u

cd "$(dirname "$0")/.."

# Sandbox: define the prerequisites install.sh expects, run only the helpers we care about.
have() { command -v "$1" >/dev/null 2>&1; }

# Pull the helper bodies from install.sh into this shell.
eval "$(awk '
  BEGIN { p=0 }
  /^current_os\(\) \{/ { p=1 }
  /^ensure_loopback_driver\(\) \{/ { p=1 }
  /^pulse_is_running\(\) \{/ { p=1 }
  /^ensure_linux_loopback\(\) \{/ { p=1 }
  /^ensure_macos_loopback\(\) \{/ { p=1 }
  /^ffmpeg_has_avfoundation_blackhole\(\) \{/ { p=1 }
  /^install_blackhole_macos\(\) \{/ { p=1 }
  p == 1 { print }
  p == 1 && /^\}$/ { p=0 }
' install.sh)"

printf 'os detected:                %s\n' "$(current_os)"
printf 'ffmpeg present:            '; if have ffmpeg; then echo yes; else echo no; fi
printf 'pactl present:             '; if have pactl; then echo yes; else echo no; fi
printf 'pulseaudio binary present: '; if have pulseaudio; then echo yes; else echo no; fi
printf 'pulse_is_running:          '; if pulse_is_running; then echo yes; else echo no; fi

echo ''
echo '--- ensure_linux_loopback output (should print install guidance when no pulse) ---'
ensure_linux_loopback 2>&1 | sed 's/^/  /'
