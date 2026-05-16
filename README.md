# StreamScribe

Bun + TypeScript CLI for Windows audio workflows where system playback (any app — Chrome, Zoom, Spotify, a game) and your microphone need to stay on separate channels.

It can:

- stream a playback loopback source and a microphone to separate Deepgram live STT websockets and print live transcripts in the terminal
- save a stereo WAV recording with playback on the left channel and microphone on the right channel
- run an interactive picker that lists actual capture devices on the machine and saves the selection — no manual JSON editing
- auto-decide whether the FFplay monitor is needed (skipped for parallel-tap loopbacks, enabled for VB-CABLE)
- list FFmpeg DirectShow devices for humans and agents

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
bun install -g --force --no-cache git+https://github.com/muneebhashone/streamscribe.git#main
```

Rerun the same one-line installer command any time to update to the latest `main` version. The installers clear StreamScribe's Bun git cache and reinstall the global package without touching your saved config or `DEEPGRAM_API_KEY`.

The one-line installers check for `ffmpeg` and `ffplay`; when either is missing they try to install FFmpeg with the platform package manager (`brew`, `apt-get`, `dnf`, `yum`, `pacman`, `winget`, or Chocolatey). They also check for `DEEPGRAM_API_KEY`; if it is missing, they prompt for a key and save it for future StreamScribe runs. **The Windows installer additionally probes for a playback capture driver and offers to install `screen-capture-recorder` for you if none is present** — fresh install to working `streamscribe live` is one command.

### Installer flags

```powershell
# Print the installed version and exit
.\install.ps1 -Version
# or via piped install:
$env:STREAMSCRIBE_VERSION = '1'; irm <url> | iex

# Force a clean reinstall, including old bin shims
.\install.ps1 -Force
# or:
$env:STREAMSCRIBE_FORCE = '1'; irm <url> | iex
```

```bash
sh install.sh --version       # print installed version, exit
sh install.sh --force         # clean old bin shims, then reinstall

# Or via piped install:
STREAMSCRIBE_VERSION=1 curl -fsSL <url> | sh
STREAMSCRIBE_FORCE=1 curl -fsSL <url> | sh
```

Installed commands:

```bash
streamscribe help
streamscribe live              # picks sources on first run, then starts live
streamscribe live --pick       # re-pick sources, then go live
streamscribe record            # stereo WAV recording
streamscribe record --pick     # re-pick sources, then record
streamscribe pick              # picker only — update saved config
streamscribe devices           # raw FFmpeg device dump
streamscribe init-config       # create a user config file
streamscribe --version         # print the installed StreamScribe version
```

`chrome-mic-stt`, `mic-audio-capture`, and `audio-recorder` are aliases for the same CLI.

## Requirements

1. Bun 1.3+
2. FFmpeg and FFplay available on `PATH`
3. A Deepgram API key in `DEEPGRAM_API_KEY`
4. Windows audio permissions for microphone access
5. A playback-capture driver — see below

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

## Playback capture driver

Pick one. The picker offers whichever is installed. **The Windows one-line installer will offer to install `screen-capture-recorder` for you if it doesn't find any of these.**

- **screen-capture-recorder** (recommended) — `https://github.com/rdp/screen-capture-recorder-to-video-windows-free`
  Adds the `virtual-audio-capturer` DirectShow device. It is a parallel tap on your default render endpoint: it captures whatever any app is playing through your default output, and you keep hearing audio normally. No per-app routing, no FFplay monitor needed.
- **VB-CABLE** — `https://vb-audio.com/Cable/`
  A virtual sink. Requires per-app routing in Windows Settings → Sound → App volume & device preferences (set each app you want captured to `CABLE Input`). The auto monitor logic enables FFplay so you can still hear the routed app.
- **Stereo Mix** — built into some sound cards. Enable it in Sound Control Panel → Recording → right-click → Show Disabled Devices → Enable.

If no loopback driver is detected at runtime, the CLI prints install URLs and exits without launching anything.

## Quick start

Just go live:

```bash
streamscribe live
```

On first run, an interactive picker lists your real capture devices and asks you to pick a playback source and a microphone:

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

The selection is saved. Subsequent `streamscribe live` runs skip the picker. Use `streamscribe live --pick` or `streamscribe pick` to re-prompt.

Live mode prints transcripts to the terminal as `[time] [playback] text` and `[time] [microphone] text`. Press `q`, `Enter`, or `Ctrl+C` to stop.

Recording mode:

```bash
streamscribe record
```

Recordings are written to `recordings/recording-YYYY-MM-DD_HH-mm-ss.wav` with playback on the left channel and microphone on the right channel.

## Configuration

The CLI reads config in this order:

1. `STREAMSCRIBE_CONFIG`
2. `MIC_AUDIO_CAPTURE_CONFIG` (legacy)
3. `AUDIO_RECORDER_CONFIG` (legacy)
4. `recorder.config.json` in the current working directory
5. user config at `~/.config/streamscribe/recorder.config.json` or Windows equivalent
6. package `recorder.config.example.json`

The picker writes back to the same path it loaded from (cwd config in dev, user config when installed). Edited configs are backed up to `recorder.config.json.bak.<timestamp>` before overwrite. The picker always resets `monitor.enabled` to `"auto"`.

Notable schema fields:

- `browser.device` — playback source name (JSON key is `browser` for backward compat; it captures any app's playback)
- `mic.device` — microphone device name
- `monitor.enabled` — `"auto"` | `true` | `false`. `"auto"` is the default: monitor is on for VB-CABLE (exclusive sink), off for `virtual-audio-capturer` and Stereo Mix (parallel taps, you already hear audio natively), off for `wasapi-loopback`.

Example config ships as `recorder.config.example.json`:

```json
{
  "ffmpegPath": "ffmpeg",
  "outputDir": "recordings",
  "sampleRate": 48000,
  "monitor": {
    "enabled": "auto",
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
    "label": "System playback (any app)",
    "backend": "dshow",
    "device": "",
    "channel": "left",
    "ttsName": "playback"
  },
  "mic": {
    "label": "Microphone",
    "backend": "dshow",
    "device": "",
    "channel": "right",
    "ttsName": "microphone"
  }
}
```

Empty `device` fields trigger the picker on first run.

## Capturing system audio and still hearing it

With `virtual-audio-capturer` (recommended): nothing to configure. It is a parallel tap on your default output, so any app that plays through your headset is captured, and you keep hearing audio normally. The picker picks this when present and `monitor.enabled: "auto"` skips the FFplay monitor automatically.

With VB-CABLE: route each app you want captured to `CABLE Input` in Windows Settings → Sound → App volume & device preferences. The picker still works; `monitor.enabled: "auto"` turns FFplay on so you can hear the routed app through your default headset. Do not set the whole Windows default output to VB-CABLE unless you intentionally want all system audio captured.

## Agent skill

This repo ships an agent skill at:

```text
skills/streamscribe/SKILL.md
```

Install the skill through the [skills.sh](https://www.skills.sh/) CLI:

```bash
npx skills add muneebhashone/streamscribe
```

The skill is advertised in `skills.json` for skills.sh-style registries. Agents can use it to install the CLI, discover devices, configure routing, and operate live transcription or recording safely.

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

- `src/cli.ts` — Bun CLI entrypoint (parses `--pick` / `--version`, dispatches commands)
- `src/lib.ts` — typed config, FFmpeg args, Deepgram websocket, device probe/enumeration, picker plumbing, recorder/live logic
- `src/picker.ts` — interactive readline picker (number entry, zero new deps)
- `install.sh` / `install.ps1` — one-line installers (FFmpeg + Bun + driver check on Windows + Deepgram key + CLI)
- `tests/lib.test.ts` — unit tests for parser, classifier, monitor logic, config helpers, FFmpeg arg builders
- `tests/distribution.test.ts` — package, installer, and skill distribution tests
- `skills/streamscribe/SKILL.md` — agent skill

## Commands

```bash
streamscribe help              # show usage
streamscribe live              # picks sources on first run, then starts live
streamscribe live --pick       # re-pick sources, then go live
streamscribe record            # stereo WAV recording
streamscribe record --pick     # re-pick sources, then record
streamscribe pick              # picker only — update saved config
streamscribe devices           # raw FFmpeg device dump
streamscribe init-config       # create a user config file
streamscribe --version         # print the installed StreamScribe version
bun run check                  # tests + TypeScript typecheck from a clone
```
