---
name: streamscribe
description: Use when a user or agent needs to install, configure, troubleshoot, or operate the streamscribe CLI for Deepgram live transcription or stereo WAV recording from a system playback source (any app) and a microphone on Windows, macOS, or Linux (Ubuntu).
version: 1.0.0
author: Muneeb Hashone
license: MIT
platforms: [windows, macos, linux]
metadata:
  hermes:
    tags: [audio, transcription, deepgram, ffmpeg, bun, windows, macos, linux, screen-capture-recorder, vb-cable, blackhole, pulseaudio]
    related_skills: [audio-capture-recording-apps, windows-audio-capture]
---

# StreamScribe

## Overview

`streamscribe` is a Bun + TypeScript terminal app that keeps system playback (any app — Chrome, Zoom, Spotify, a game) and a physical microphone on separate channels. It runs on Windows, macOS, and Linux (Ubuntu and other PulseAudio/PipeWire distros). It can:

- stream a playback loopback source and a microphone to separate Deepgram live STT websockets and print final transcript lines in the terminal
- save a stereo WAV recording with playback on the left channel and microphone on the right channel
- auto-decide whether to spawn an FFplay monitor: skipped for parallel taps where the user already hears audio natively (`virtual-audio-capturer`, `Stereo Mix`, PulseAudio `*.monitor` sources); enabled for exclusive sinks where the routed app no longer plays through the system output (`CABLE Output` on Windows, `BlackHole`/`Multi-Output Device` on macOS)
- run an interactive picker that lists actual capture devices on the current OS (DirectShow on Windows, AVFoundation on macOS, PulseAudio sources on Linux) and saves the selection to user config

Use this skill for both human-facing setup and AI-agent operation. Do not invent device names: the picker enumerates and persists them automatically.

## Installation

macOS and Linux shell install:

```bash
curl -fsSL https://raw.githubusercontent.com/muneebhashone/streamscribe/main/install.sh | sh
```

Windows PowerShell install:

```powershell
irm https://raw.githubusercontent.com/muneebhashone/streamscribe/main/install.ps1 | iex
```

Direct Bun install:

```bash
bun install -g --force --no-cache github:muneebhashone/streamscribe#<main-sha>
```

Rerun the same one-line installer command any time to update to the latest `main` version. The installers resolve `main` to the current commit, clear StreamScribe's Bun git cache, and reinstall the global package without touching saved config or `DEEPGRAM_API_KEY`. Prefer the installers over direct Bun installs because moving git refs can be cached by Bun.

After install, the main commands are:

```bash
streamscribe help
streamscribe live              # picks sources on first run, otherwise starts live
streamscribe live --pick       # re-pick sources, then go live
streamscribe record            # stereo WAV recording
streamscribe record --pick     # re-pick sources, then record
streamscribe pick              # picker only — update saved config
streamscribe devices           # raw FFmpeg device dump
streamscribe init-config       # create a user config file
streamscribe --version         # print the installed StreamScribe version
```

`chrome-mic-stt`, `mic-audio-capture`, and `audio-recorder` are aliases for the same CLI.

### Installer flags

Both installers accept `--version` (print installed CLI version and exit) and `--force` (clean old bin shims before reinstalling). Normal reruns are enough for updates. When piped via `irm | iex` or `curl | sh`, pass flags as environment variables instead:

```powershell
$env:STREAMSCRIBE_VERSION = '1'; irm <url> | iex
$env:STREAMSCRIBE_FORCE   = '1'; irm <url> | iex
```

```bash
STREAMSCRIBE_VERSION=1 curl -fsSL <url> | sh
STREAMSCRIBE_FORCE=1   curl -fsSL <url> | sh
```

Each installer probes for a system-audio loopback source after the FFmpeg step:

- **Windows (`install.ps1`)** — looks for `virtual-audio-capturer`, `CABLE Output`, `Stereo Mix`, or `VoiceMeeter`. If none is found, asks `[Y/n]` and installs `screen-capture-recorder` from its latest GitHub release with a UAC prompt.
- **macOS (`install.sh`)** — looks for `BlackHole`, `Loopback Audio`, `Soundflower`, or a `Multi-Output Device` in AVFoundation. If none is found, asks `[Y/n]` and runs `brew install blackhole-2ch`, then explains how to create a Multi-Output Device so the user can both capture and hear audio.
- **Linux (`install.sh`)** — checks for a reachable PulseAudio server via `pactl info`, `pulseaudio --check`, or `ffmpeg -sources pulse`. PulseAudio's monitor sources provide loopback natively, so no extra driver is needed. If the server is missing, the installer prints `apt-get`/`dnf`/`pacman` commands to install `pulseaudio` or `pipewire-pulse`.

## Required Environment

- Windows, macOS, or Linux (Ubuntu/Debian/Fedora/Arch/etc.) with microphone permission enabled
- Bun 1.3+
- FFmpeg and FFplay on PATH
- Deepgram API key in `DEEPGRAM_API_KEY` for live transcription
- A system-audio loopback source — see [Playback capture per platform](#playback-capture-per-platform)

Set the API key in the current shell or a `.env` file in the working directory:

```bash
export DEEPGRAM_API_KEY="your_deepgram_key_here"
```

## Playback capture per platform

The picker offers whichever sources are detected on the current OS. The CLI picks the right FFmpeg input backend automatically (`dshow` on Windows, `avfoundation` on macOS, `pulse` on Linux).

### Windows (DirectShow)

- **screen-capture-recorder (recommended)** — `https://github.com/rdp/screen-capture-recorder-to-video-windows-free`
  Adds the `virtual-audio-capturer` DirectShow device. Parallel tap on the default render endpoint: captures whatever any app is playing AND you keep hearing audio normally. No per-app routing, no FFplay monitor needed.
- **VB-CABLE** — `https://vb-audio.com/Cable/`
  A virtual sink. Requires per-app routing in Windows Settings → Sound → App volume & device preferences (set each app you want captured to `CABLE Input`). FFplay monitor is enabled automatically for `CABLE Output`.
- **Stereo Mix** — built into some sound cards. Enable in Sound Control Panel → Recording → right-click → Show Disabled Devices → Enable.

### macOS (AVFoundation)

macOS has no built-in system-audio loopback. Install one virtual driver:

- **BlackHole 2ch (recommended)** — free, open source: `brew install blackhole-2ch` (the installer offers this automatically). Manual install: `https://existential.audio/blackhole/`. Open Audio MIDI Setup and create a Multi-Output Device that includes your speakers/headset AND BlackHole 2ch; set it as the System Output so you both hear audio AND streamscribe can capture it.
- **Loopback by Rogue Amoeba** — paid, polished routing UI: `https://rogueamoeba.com/loopback/`.
- **Soundflower** — legacy, deprecated; only use if already installed.

The auto monitor is enabled for BlackHole / Loopback Audio / Multi-Output Device, so FFplay plays the captured stream back to the system output.

### Linux (PulseAudio / PipeWire)

PulseAudio provides system-audio loopback for free via `*.monitor` sources. The CLI uses `ffmpeg -f pulse -i <monitor-source>` directly. No third-party driver is needed.

- Ubuntu 22.04+ uses PipeWire by default; install `pipewire-pulse` for PulseAudio API compatibility: `sudo apt-get install -y pipewire-pulse`.
- Older Ubuntu/Debian/Fedora/Arch: install `pulseaudio` via the system package manager.
- Verify with `pactl list sources short | grep monitor` — you should see one entry per output device (e.g. `alsa_output.pci-0000_00_1f.3.analog-stereo.monitor`).

The auto monitor is off for PulseAudio because monitor sources are parallel taps — you already hear audio natively.

## First-Run Flow

Just run live:

```bash
streamscribe live
```

If sources haven't been picked yet (or the saved devices aren't present anymore), the picker prompts:

```
First-time setup: pick your audio sources.

Playback source (any app's audio — Chrome, Zoom, Spotify, etc.):
  1) virtual-audio-capturer                          [recommended]
  2) CABLE Output (VB-Audio Virtual Cable)
  3) Stereo Mix (Realtek HD Audio)
  c) cancel

> 1

Microphone (pick one of your attached mics):
  1) Headset Microphone (Plantronics Blackwire 3220 Series)
  2) Microphone Array (Realtek HD Audio)
  c) cancel

> 1

Saved to: C:\Users\<you>\.config\streamscribe\recorder.config.json
```

Subsequent `streamscribe live` runs skip the picker. Use `streamscribe live --pick` or `streamscribe pick` to re-prompt. The mic list is re-enumerated every time, so plugging in a new mic and running `--pick` immediately offers it.

If no loopback driver is detected at all, the CLI prints install URLs for screen-capture-recorder and VB-CABLE and exits without launching anything.

## Config Resolution Order

1. `STREAMSCRIBE_CONFIG` environment variable
2. `MIC_AUDIO_CAPTURE_CONFIG` environment variable (legacy)
3. `AUDIO_RECORDER_CONFIG` environment variable (legacy)
4. `recorder.config.json` in the current working directory
5. user config at `~/.config/streamscribe/recorder.config.json` (or `%USERPROFILE%\.config\streamscribe\recorder.config.json` on Windows)
6. package example config

The picker writes back to the same config path that was loaded. If a `recorder.config.json` exists in the working directory, that file is updated (useful for dev). Otherwise the user config at `~/.config/streamscribe/recorder.config.json` is written. When `--pick` overwrites a config that was hand-edited (differs from the example), the old file is copied to `recorder.config.json.bak.<timestamp>` first. The picker always resets `monitor.enabled` to `"auto"` so the heuristic decides correctly for the new source.

## Config Schema (Notable Fields)

- `browser.backend` and `mic.backend` — FFmpeg input backend. The picker writes this automatically based on the current OS: `dshow` on Windows, `avfoundation` on macOS, `pulse` on Linux. Legacy `wasapi`/`wasapi-loopback` are still accepted on Windows.
- `browser.device` — playback source device name (the JSON key is `browser` for backward compat; it's actually "any app's playback")
- `mic.device` — microphone device name
- `monitor.enabled` — `"auto"` | `true` | `false`. `"auto"` is the default:
  - **on** for exclusive sinks where the app no longer plays through the system output: VB-CABLE (`CABLE Output`), BlackHole, Multi-Output Device, Loopback Audio.
  - **off** for parallel taps where audio is still audible natively: `virtual-audio-capturer`, Stereo Mix, PulseAudio `*.monitor` sources, `wasapi-loopback`, and any `pulse` backend.
- `deepgram.apiKeyEnv` — env var that holds the Deepgram API key (default `DEEPGRAM_API_KEY`)

## Agent Operation Pattern

When operating for a user:

1. Detect whether StreamScribe is installed and at what version with `streamscribe --version` (returns the package version, e.g. `1.1.0`) or `install.ps1 -Version` / `install.sh --version`. Use this before recommending a reinstall.
2. If config does not exist or its devices aren't currently present, the CLI will run the picker. In a non-interactive environment (no TTY) it exits with an error pointing the user at `streamscribe pick`.
3. If a loopback driver is missing, the CLI prints install instructions and exits. Do not attempt to install drivers silently from inside the CLI. The Windows installer (`install.ps1`) handles the driver install during setup with an explicit `[Y/n]` consent prompt.
4. For non-interactive validation, prefer `streamscribe devices`. Do not start `live` unless the user is present (it requires `q`, Enter, or Ctrl+C to stop and an active Deepgram key).
5. For live mode, set `DEEPGRAM_API_KEY` and run:

```bash
streamscribe live
```

6. Stop with `q`, Enter, or Ctrl+C.

## Recording Mode

```bash
streamscribe record
```

Channel map:

- left channel: playback loopback source
- right channel: microphone

Recordings are written to `recordings/recording-YYYY-MM-DD_HH-mm-ss.wav` under the current project/root used by the CLI.

## Common Pitfalls

1. **No audio captured / no transcripts.** The configured loopback device may not exist on the machine. Re-run with `--pick` to reselect from the live list.

2. **Hearing audio twice while an exclusive sink is selected.** That's the monitor working as intended — the routed app's audio is reaching the virtual sink only, and FFplay is playing it back to your default output. To stop hearing it twice, switch to a parallel tap (`virtual-audio-capturer` on Windows, a PulseAudio `.monitor` source on Linux). On macOS, a `Multi-Output Device` that includes both BlackHole and your speakers is the equivalent parallel-tap setup.

3. **No loopback driver detected.**
   - **Windows:** install `screen-capture-recorder` (the installer offers it) or VB-CABLE.
   - **macOS:** the installer offers `brew install blackhole-2ch`. After install, create a Multi-Output Device in Audio MIDI Setup that includes BlackHole 2ch AND your speakers/headset, then set it as the macOS System Output.
   - **Linux:** install/start PulseAudio or PipeWire-Pulse and verify `pactl list sources short | grep monitor`.

4. **WASAPI examples fail (Windows).** Stock FFmpeg builds (gyan.dev, BtbN) do not include the `wasapi` indev. The CLI detects this at runtime and never offers WASAPI in the picker. Use DirectShow-based sources.

5. **PulseAudio sources missing on Linux.** If `streamscribe devices` shows nothing under "PulseAudio sources", the pulse server is not reachable from the user shell. Make sure pulse/pipewire-pulse is installed and the user-level service is started; many containers/SSH sessions don't have a pulse server by default.

6. **AVFoundation prompts for microphone permission on macOS.** The first time FFmpeg opens an AVFoundation audio device, macOS asks the user to grant microphone access to the terminal app (Terminal/iTerm/VS Code). Re-run streamscribe after granting permission. Likewise, for `BlackHole 2ch` to capture playback, the System Output must be set to a Multi-Output Device that routes to BlackHole.

7. **Feedback loops.** Do not play TTS or system audio into the same exclusive sink (VB-CABLE / BlackHole) that is being transcribed unless feedback is explicitly desired.

8. **Headless / non-TTY runs.** If sources aren't configured and stdin is not a TTY, the CLI exits with guidance rather than hanging. Run `streamscribe pick` from an interactive terminal first.

## Verification Checklist

- [ ] `streamscribe --version` prints a semver
- [ ] `streamscribe help` works
- [ ] `streamscribe devices` lists devices for the current OS (DirectShow on Windows, AVFoundation on macOS, PulseAudio sources on Linux)
- [ ] `ffmpeg -version` and `ffplay -version` work
- [ ] `DEEPGRAM_API_KEY` is set for live mode
- [ ] Loopback source is available on the current OS:
  - Windows: virtual-audio-capturer / CABLE Output / Stereo Mix
  - macOS: BlackHole 2ch (and Multi-Output Device configured) / Loopback Audio
  - Linux: PulseAudio reachable and a `*.monitor` source visible via `pactl list sources short`
- [ ] `streamscribe live` runs the picker on first use and starts transcription
- [ ] `streamscribe live --pick` re-prompts and backs up the prior config to `recorder.config.json.bak.<timestamp>`
- [ ] With a parallel tap selected, no FFplay monitor process spawns (`monitor.enabled = "auto"` → `virtual-audio-capturer`, `*.monitor`, etc.)
- [ ] With an exclusive sink selected, FFplay monitor spawns so the user can hear playback (`CABLE Output`, `BlackHole`, `Multi-Output Device`)
