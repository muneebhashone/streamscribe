---
name: streamscribe
description: Use when a user or agent needs to install, configure, troubleshoot, or operate the streamscribe CLI for Deepgram live transcription or stereo WAV recording from a system playback source (any app) and a microphone on Windows.
version: 1.0.0
author: Muneeb Hashone
license: MIT
platforms: [windows]
metadata:
  hermes:
    tags: [audio, transcription, deepgram, ffmpeg, bun, windows, screen-capture-recorder, vb-cable]
    related_skills: [audio-capture-recording-apps, windows-audio-capture]
---

# StreamScribe

## Overview

`streamscribe` is a Bun + TypeScript terminal app for Windows audio workflows that keep system playback (any app — Chrome, Zoom, Spotify, a game) and a physical microphone on separate channels. It can:

- stream a playback loopback source and a microphone to separate Deepgram live STT websockets and print final transcript lines in the terminal
- save a stereo WAV recording with playback on the left channel and microphone on the right channel
- monitor playback back to the user's headphones through FFplay when the loopback source is an exclusive sink (VB-CABLE) — and skip the monitor automatically when the loopback source is a parallel tap (virtual-audio-capturer, Stereo Mix) so the user keeps hearing audio natively
- run an interactive picker that lists actual capture devices on the machine and saves the selection to user config

Use this skill for both human-facing setup and AI-agent operation. Do not invent device names: the picker enumerates and persists them automatically.

## Installation

Human shell install:

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

The Windows installer also probes for a playback capture driver (`virtual-audio-capturer`, `CABLE Output`, `Stereo Mix`, `VoiceMeeter`) after the FFmpeg step. If none is found, it asks `[Y/n]` and installs `screen-capture-recorder` from its latest GitHub release with a UAC prompt and interactive click-through. macOS/Linux installers skip this step (DirectShow is Windows-only).

## Required Environment

- Windows with microphone permission enabled
- Bun 1.3+
- FFmpeg and FFplay on PATH
- Deepgram API key in `DEEPGRAM_API_KEY` for live transcription
- A playback-capture driver. **Recommended:** screen-capture-recorder (exposes `virtual-audio-capturer`). **Alternative:** VB-CABLE. The Windows one-line installer offers to install screen-capture-recorder automatically when none is detected.

Set the API key in the current shell or a `.env` file in the working directory:

```bash
export DEEPGRAM_API_KEY="your_deepgram_key_here"
```

## Playback Capture Drivers

Pick one (the picker offers whichever is installed):

- **screen-capture-recorder** — `https://github.com/rdp/screen-capture-recorder-to-video-windows-free`
  Adds the `virtual-audio-capturer` DirectShow device. It is a parallel tap on the default render endpoint: it captures whatever any app is playing through your default output, AND you keep hearing audio normally. No per-app routing, no FFplay monitor needed. This is the recommended driver.
- **VB-CABLE** — `https://vb-audio.com/Cable/`
  A virtual sink. Requires per-app routing in Windows Settings → Sound → App volume & device preferences (set each app you want captured to `CABLE Input`). Because the routed app no longer plays to your headset, FFplay monitor must run; the auto monitor logic enables it for you when a `CABLE Output` device is configured.
- **Stereo Mix** — built into some sound cards. Enable it in Sound Control Panel → Recording → right-click → Show Disabled Devices → Enable.

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
5. user config at `%USERPROFILE%\.config\streamscribe\recorder.config.json`
6. package example config

The picker writes back to the same config path that was loaded. If a `recorder.config.json` exists in the working directory, that file is updated (useful for dev). Otherwise the user config at `%USERPROFILE%\.config\streamscribe\recorder.config.json` is written. When `--pick` overwrites a config that was hand-edited (differs from the example), the old file is copied to `recorder.config.json.bak.<timestamp>` first. The picker always resets `monitor.enabled` to `"auto"` so the heuristic decides correctly for the new source.

## Config Schema (Notable Fields)

- `browser.device` — playback source device name (the JSON key is `browser` for backward compat; it's actually "any app's playback")
- `mic.device` — microphone device name
- `monitor.enabled` — `"auto"` | `true` | `false`. `"auto"` is the new default: monitor is on for VB-CABLE (exclusive sink), off for `virtual-audio-capturer` and Stereo Mix (parallel taps), off for `wasapi-loopback` backend.
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

2. **Hearing audio twice while VB-CABLE is selected.** That's the monitor working as intended — the routed app's audio is reaching VB-CABLE only, and FFplay is playing the CABLE Output back to your headset. To stop hearing it twice, choose `virtual-audio-capturer` instead (parallel tap, no monitor needed).

3. **No loopback driver detected.** The CLI prints screen-capture-recorder + VB-CABLE URLs and exits. Install one (reboot if prompted), then re-run.

4. **WASAPI examples fail.** Stock FFmpeg builds (gyan.dev, BtbN) do not include the `wasapi` indev. The CLI detects this at runtime and never offers WASAPI in the picker. Use DirectShow-based sources.

5. **Feedback loops.** Do not play TTS or system audio into the same VB-CABLE endpoint that is being transcribed unless feedback is explicitly desired.

6. **Headless / non-TTY runs.** If sources aren't configured and stdin is not a TTY, the CLI exits with guidance rather than hanging. Run `streamscribe pick` from an interactive terminal first.

## Verification Checklist

- [ ] `streamscribe --version` prints a semver
- [ ] `streamscribe help` works
- [ ] `streamscribe devices` lists DirectShow audio devices
- [ ] `ffmpeg -version` and `ffplay -version` work
- [ ] `DEEPGRAM_API_KEY` is set for live mode
- [ ] One loopback driver is installed (virtual-audio-capturer, CABLE Output, or Stereo Mix)
- [ ] `streamscribe live` runs the picker on first use and starts transcription
- [ ] `streamscribe live --pick` re-prompts and backs up the prior config to `recorder.config.json.bak.<timestamp>`
- [ ] With `virtual-audio-capturer` selected, no FFplay monitor process spawns (`monitor.enabled = "auto"`)
- [ ] With `CABLE Output (...)` selected, FFplay monitor spawns so the user can hear playback
