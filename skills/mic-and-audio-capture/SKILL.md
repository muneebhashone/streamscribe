---
name: mic-and-audio-capture
description: Use when a user or agent needs to install, configure, troubleshoot, or operate the mic-audio-capture CLI for Deepgram live transcription or stereo WAV recording from separate Chrome/system and microphone audio sources.
version: 1.0.0
author: Muneeb Hashone
license: MIT
platforms: [windows]
metadata:
  hermes:
    tags: [audio, transcription, deepgram, ffmpeg, bun, vb-cable, windows]
    related_skills: [audio-capture-recording-apps, windows-audio-capture]
---

# Mic and Audio Capture

## Overview

`mic-audio-capture` is a Bun + TypeScript terminal app for Windows audio workflows where Chrome/system playback and the physical microphone must stay separate. It can:

- stream Chrome/system playback and microphone audio to separate Deepgram live STT websockets and print transcripts in the terminal
- monitor original Chrome/system audio back into the user's headphones through FFplay when Chrome is routed to VB-CABLE
- save a stereo WAV recording with browser/system playback on the left channel and microphone on the right channel
- list FFmpeg DirectShow devices so the exact Windows device names can be configured

Use this skill for both human-facing setup and AI-agent operation. Do not invent device names: always discover devices first, then update configuration.

## Installation

Human shell install:

```bash
curl -fsSL https://raw.githubusercontent.com/muneebhashone/mic-and-audio-capture/main/install.sh | sh
```

Windows PowerShell install:

```powershell
irm https://raw.githubusercontent.com/muneebhashone/mic-and-audio-capture/main/install.ps1 | iex
```

Direct Bun install:

```bash
bun install -g git+https://github.com/muneebhashone/mic-and-audio-capture.git
```

After install, the main commands are:

```bash
mic-audio-capture help
mic-audio-capture init-config
mic-audio-capture devices
mic-audio-capture live
mic-audio-capture record
```

`chrome-mic-stt` is an alias for the same CLI.

## Required Environment

- Windows with microphone permission enabled
- Bun 1.3+
- FFmpeg and FFplay on PATH
- Deepgram API key in `DEEPGRAM_API_KEY` for live transcription
- A loopback capture path for Chrome/system audio, usually VB-CABLE

Set the API key in the current shell or a `.env` file in the working directory:

```bash
export DEEPGRAM_API_KEY="your_deepgram_key_here"
```

## Configuration Workflow

1. Create a user config:

```bash
mic-audio-capture init-config
```

2. List capture devices:

```bash
mic-audio-capture devices
```

3. Edit the generated config and set exact device names from the device list:

- `browser.device`: usually `CABLE Output (VB-Audio Virtual Cable)`
- `mic.device`: the actual microphone, for example `Headset Microphone (...)`

The CLI reads config in this order:

1. `MIC_AUDIO_CAPTURE_CONFIG` environment variable
2. `AUDIO_RECORDER_CONFIG` environment variable
3. `recorder.config.json` in the current working directory
4. user config at `~/.config/mic-and-audio-capture/recorder.config.json` or Windows equivalent
5. package example config

## Chrome/VB-CABLE Routing

For live transcription where the user can still hear original Chrome audio:

1. Keep Windows default playback device set to the real headset/speakers.
2. Route only Chrome to `CABLE Input` in Windows App volume/device preferences.
3. Configure `browser.device` as `CABLE Output (VB-Audio Virtual Cable)`.
4. Keep `monitor.enabled` set to `true` so FFplay monitors the original cable audio to the default headset.
5. Do not route the whole system default output to VB-CABLE unless the user explicitly wants all system audio captured.

## Agent Operation Pattern

When operating for a user:

1. Run `mic-audio-capture devices` and capture the DirectShow audio devices.
2. If the configured device is absent, update config or tell the user which routing/install step is missing.
3. Verify FFmpeg and FFplay:

```bash
ffmpeg -version
ffplay -version
```

4. For non-interactive validation, run device discovery and configuration checks only. Do not start `live` unless the user is present because it requires interactive stop controls and an active Deepgram key.
5. For live mode, tell the user to play Chrome audio, then run:

```bash
mic-audio-capture live
```

6. Stop with `q`, Enter, or Ctrl+C.

## Recording Mode

To save a stereo WAV:

```bash
mic-audio-capture record
```

Channel map:

- left channel: browser/system playback loopback
- right channel: direct microphone

Recordings are written to `recordings/recording-YYYY-MM-DD_HH-mm-ss.wav` under the current project/root used by the CLI.

## Common Pitfalls

1. **Transcription works but the user hears nothing.** Chrome may be routed to `CABLE Input` without monitoring enabled, or the default playback device may be VB-CABLE instead of the headset. Keep default playback as the headset and `monitor.enabled: true`.

2. **Chrome audio does not transcribe.** The app can only capture devices exposed to FFmpeg. Run `mic-audio-capture devices` and verify `CABLE Output` or another loopback device appears.

3. **Wrong microphone source.** Do not capture the microphone through Chrome/tab audio. Configure `mic.device` as the physical DirectShow microphone.

4. **WASAPI examples fail.** Some FFmpeg builds do not include WASAPI input support. Prefer DirectShow devices that appear in `mic-audio-capture devices`.

5. **Feedback loops.** Do not play TTS or system audio into the same VB-CABLE endpoint that is being transcribed unless feedback is explicitly desired.

6. **Hard-coded local device names.** Device names vary. Always use the exact names printed by FFmpeg on the target machine.

## Verification Checklist

- [ ] `mic-audio-capture help` works
- [ ] `mic-audio-capture devices` lists DirectShow audio devices
- [ ] `ffmpeg -version` and `ffplay -version` work
- [ ] `DEEPGRAM_API_KEY` is set for live mode
- [ ] Chrome is routed to `CABLE Input`
- [ ] `browser.device` is the matching `CABLE Output` capture device
- [ ] `mic.device` is the direct microphone device
- [ ] Windows default playback remains the real headset/speakers
- [ ] `monitor.enabled` is true when the user wants to hear original Chrome audio
