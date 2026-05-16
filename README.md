# Mic and Audio Capture

Bun + TypeScript CLI for Windows audio workflows where Chrome/system playback and microphone audio need to stay separate.

It can:

- stream Chrome/system playback and microphone audio to separate Deepgram live STT websockets and print live transcripts in the terminal
- monitor the original Chrome/system audio back into your headphones when Chrome is routed through VB-CABLE
- save a stereo WAV recording with Chrome/system playback on the left channel and microphone on the right channel
- list FFmpeg DirectShow devices so humans and agents can configure exact device names

## One-line install

macOS/Linux/Git Bash/WSL shell:

```bash
curl -fsSL https://raw.githubusercontent.com/muneebhashone/mic-and-audio-capture/main/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/muneebhashone/mic-and-audio-capture/main/install.ps1 | iex
```

Direct Bun install:

```bash
bun install -g git+https://github.com/muneebhashone/mic-and-audio-capture.git
```

Installed commands:

```bash
mic-audio-capture help
mic-audio-capture init-config
mic-audio-capture devices
mic-audio-capture live
mic-audio-capture record
```

`chrome-mic-stt` and `audio-recorder` are aliases for the same CLI.

## Requirements

1. Bun 1.3+
2. FFmpeg and FFplay available on `PATH`
3. A Deepgram API key in `DEEPGRAM_API_KEY`
4. Windows audio permissions for microphone access
5. A loopback/recording device for Chrome/system playback, such as VB-CABLE

Check requirements:

```bash
bun --version
ffmpeg -version
ffplay -version
```

Set your Deepgram API key in the shell before live mode, or put it in a `.env` file in the directory where you run the CLI. Bun automatically loads `.env`.

```bash
export DEEPGRAM_API_KEY="your_deepgram_key_here"
```

## Quick start

Create a user config:

```bash
mic-audio-capture init-config
```

List available devices:

```bash
mic-audio-capture devices
```

Edit the generated config and set:

- `browser.device` to the exact loopback device, usually `CABLE Output (VB-Audio Virtual Cable)`
- `mic.device` to the exact physical microphone device

Start live Deepgram STT text output for both channels:

```bash
mic-audio-capture live
```

Live mode prints transcripts to the terminal as `[time] [browser] text` and `[time] [microphone] text`. Deepgram TTS is not used. Press `q`, `Enter`, or `Ctrl+C` to stop.

Recording mode:

```bash
mic-audio-capture record
```

Recordings are written to `recordings/recording-YYYY-MM-DD_HH-mm-ss.wav` with Chrome/system playback on the left channel and microphone on the right channel.

## Configuration

The CLI reads config in this order:

1. `MIC_AUDIO_CAPTURE_CONFIG`
2. `AUDIO_RECORDER_CONFIG`
3. `recorder.config.json` in the current working directory
4. user config at `~/.config/mic-and-audio-capture/recorder.config.json` or Windows equivalent
5. package `recorder.config.example.json`

Example config ships as `recorder.config.example.json`.

```json
{
  "ffmpegPath": "ffmpeg",
  "outputDir": "recordings",
  "sampleRate": 48000,
  "monitor": {
    "enabled": true,
    "ffplayPath": "ffplay",
    "volume": 100
  },
  "deepgram": {
    "apiKeyEnv": "DEEPGRAM_API_KEY",
    "sttModel": "nova-3",
    "sttSampleRate": 16000,
    "language": "en-US",
    "interimResults": true,
    "endpointing": 300,
    "punctuate": true,
    "smartFormat": true,
    "printInterim": true,
    "ttsEnabled": false,
    "ttsModel": "aura-2-thalia-en",
    "ttsSampleRate": 24000,
    "ttsEncoding": "linear16",
    "ttsContainer": "wav",
    "speakChannelNames": false,
    "ffplayPath": "ffplay",
    "debug": false
  },
  "browser": {
    "label": "Chrome / system audio",
    "backend": "dshow",
    "device": "CABLE Output (VB-Audio Virtual Cable)",
    "channel": "left",
    "ttsName": "browser"
  },
  "mic": {
    "label": "System microphone",
    "backend": "dshow",
    "device": "Headset Microphone (Plantronics Blackwire 3220 Series)",
    "channel": "right",
    "ttsName": "microphone"
  }
}
```

## Capturing Chrome audio and still hearing it

A normal microphone appears to FFmpeg as a capture device, but Chrome audio usually does not. For isolated Chrome capture, route Chrome to a virtual audio playback device and record the matching capture endpoint.

Recommended VB-CABLE setup:

1. Keep Windows default playback set to your real headset/speakers.
2. Route only Chrome to `CABLE Input` in Windows App volume/device preferences.
3. Set `browser.device` to `CABLE Output (VB-Audio Virtual Cable)`.
4. Keep `monitor.enabled: true` so FFplay plays the original cable audio to your default headset.

Do not set the whole Windows default playback device to VB-CABLE unless you intentionally want all system audio captured.

## Agent skill

This repo ships an agent skill at:

```text
skills/mic-and-audio-capture/SKILL.md
```

The skill is advertised in `skills.json` for skills.sh-style registries. Agents can use it to install the CLI, discover devices, configure VB-CABLE routing, and operate live transcription or recording safely.

If your agent supports installing skills from a GitHub repository, point it at this repo or at the skill path above.

## Development

From a clone:

```bash
bun install
bun test
bun run typecheck
bun run check
bun src/cli.ts help
```

Project layout:

- `src/cli.ts` - Bun CLI entrypoint
- `src/lib.ts` - typed configuration, FFmpeg args, Deepgram websocket, recorder/live logic
- `tests/lib.test.ts` - unit tests for pure behavior
- `tests/distribution.test.ts` - package, installer, and skill distribution tests
- `skills/mic-and-audio-capture/SKILL.md` - agent skill

## Commands

```bash
mic-audio-capture help        # show usage
mic-audio-capture init-config # create user config
mic-audio-capture devices     # list DirectShow/WASAPI devices
mic-audio-capture live        # live Deepgram STT text output
mic-audio-capture record      # stereo WAV recording
bun run check                 # tests + TypeScript typecheck from a clone
```
