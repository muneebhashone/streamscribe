# StreamScribe

Bun + TypeScript CLI for Windows audio workflows where Chrome/system playback and microphone audio need to stay separate.

It can:

- stream Chrome/system playback and microphone audio to separate Deepgram live STT websockets and print live transcripts in the terminal
- monitor the original Chrome/system audio back into your headphones when Chrome is routed through VB-CABLE
- save a stereo WAV recording with Chrome/system playback on the left channel and microphone on the right channel
- list FFmpeg DirectShow devices so humans and agents can configure exact device names

## One-line install

macOS/Linux/Git Bash/WSL shell:

```bash
curl -fsSL https://raw.githubusercontent.com/muneebhashone/streamscribe/main/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/muneebhashone/streamscribe/main/install.ps1 | iex
```

Direct Bun install:

```bash
bun install -g git+https://github.com/muneebhashone/streamscribe.git
```

The one-line installers check for `ffmpeg` and `ffplay`; when either is missing they try to install FFmpeg with the platform package manager (`brew`, `apt-get`, `dnf`, `yum`, `pacman`, `winget`, or Chocolatey). They also check for `DEEPGRAM_API_KEY`; if it is missing, they prompt for a key and save it for future StreamScribe runs.

Installed commands:

```bash
streamscribe help
streamscribe init-config
streamscribe devices
streamscribe live
streamscribe record
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
streamscribe init-config
```

List available devices:

```bash
streamscribe devices
```

Edit the generated config and set:

- `browser.device` to the exact loopback device, usually `CABLE Output (VB-Audio Virtual Cable)`
- `mic.device` to the exact physical microphone device

Start live Deepgram STT text output for both channels:

```bash
streamscribe live
```

Live mode prints transcripts to the terminal as `[time] [browser] text` and `[time] [microphone] text`. Deepgram TTS is not used. Press `q`, `Enter`, or `Ctrl+C` to stop.

Recording mode:

```bash
streamscribe record
```

Recordings are written to `recordings/recording-YYYY-MM-DD_HH-mm-ss.wav` with Chrome/system playback on the left channel and microphone on the right channel.

## Configuration

The CLI reads config in this order:

1. `STREAMSCRIBE_CONFIG`
2. `MIC_AUDIO_CAPTURE_CONFIG` (legacy)
3. `AUDIO_RECORDER_CONFIG` (legacy)
4. `recorder.config.json` in the current working directory
5. user config at `~/.config/streamscribe/recorder.config.json` or Windows equivalent
6. package `recorder.config.example.json`

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
skills/streamscribe/SKILL.md
```

Install the skill through the [skills.sh](https://www.skills.sh/) CLI:

```bash
npx skills add muneebhashone/streamscribe
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
- `skills/streamscribe/SKILL.md` - agent skill

## Commands

```bash
streamscribe help        # show usage
streamscribe init-config # create user config
streamscribe devices     # list DirectShow/WASAPI devices
streamscribe live        # live Deepgram STT text output
streamscribe record      # stereo WAV recording
bun run check                 # tests + TypeScript typecheck from a clone
```
