# StreamScribe

Bun + TypeScript CLI for keeping system playback (any app — Chrome, Zoom, Spotify, a game) and your microphone on separate channels. Runs on **Windows**, **macOS**, and **Linux (Ubuntu, Fedora, Arch, etc.)**.

It can:

- stream a playback loopback source and a microphone to separate Deepgram live STT websockets and print live transcripts in the terminal
- save a stereo WAV recording with playback on the left channel and microphone on the right channel
- run an interactive picker that lists actual capture devices on the current OS (DirectShow / AVFoundation / PulseAudio) and saves the selection — no manual JSON editing
- auto-decide whether the FFplay monitor is needed (skipped for parallel-tap loopbacks like `virtual-audio-capturer`, Stereo Mix, and PulseAudio `*.monitor` sources; enabled for exclusive sinks like VB-CABLE, BlackHole, and Multi-Output Devices)
- list audio devices for humans and agents using whichever FFmpeg indev applies on this OS

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
bun install -g --force --no-cache github:muneebhashone/streamscribe#<main-sha>
```

Rerun the same one-line installer command any time to update to the latest `main` version. The installers resolve `main` to the current commit, clear StreamScribe's Bun git cache, and reinstall the global package without touching your saved config or `DEEPGRAM_API_KEY`. Prefer the installers over direct Bun installs because moving git refs can be cached by Bun.

The one-line installers check for `ffmpeg` and `ffplay`; when either is missing they try to install FFmpeg with the platform package manager (`brew`, `apt-get`, `dnf`, `yum`, `pacman`, `winget`, or Chocolatey). They also check for `DEEPGRAM_API_KEY`; if it is missing, they prompt for a key and save it for future StreamScribe runs. The loopback driver check is platform-aware:

- **Windows (`install.ps1`)** probes for `virtual-audio-capturer` / `CABLE Output` / `Stereo Mix` / `VoiceMeeter`. If none is present, it asks `[Y/n]` and installs `screen-capture-recorder` from its latest GitHub release with a UAC prompt.
- **macOS (`install.sh`)** probes AVFoundation for `BlackHole` / `Loopback Audio` / `Soundflower` / `Multi-Output Device`. If none is present, it asks `[Y/n]` and runs `brew install blackhole-2ch`, then explains how to set up a Multi-Output Device.
- **Linux (`install.sh`)** checks for a reachable PulseAudio (or PipeWire-Pulse) server. PulseAudio's monitor sources are native loopback — no extra driver needed. If the server is missing, the installer prints the `apt-get` / `dnf` / `pacman` commands to install it.

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
4. Microphone permission granted to your terminal (Windows audio privacy / macOS Microphone permission / Linux user in the right audio group)
5. A playback-capture source per platform (see [Playback capture per platform](#playback-capture-per-platform))

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

## Playback capture per platform

The picker enumerates whichever audio devices the current OS exposes via FFmpeg and offers them by kind (playback / microphone). The CLI picks the right FFmpeg input backend automatically: `dshow` on Windows, `avfoundation` on macOS, `pulse` on Linux.

### Windows (DirectShow)

- **screen-capture-recorder** (recommended) — `https://github.com/rdp/screen-capture-recorder-to-video-windows-free`
  Adds the `virtual-audio-capturer` DirectShow device. Parallel tap on the default render endpoint: captures whatever any app is playing through your default output, and you keep hearing audio normally. No per-app routing, no FFplay monitor needed.
- **VB-CABLE** — `https://vb-audio.com/Cable/`
  A virtual sink. Requires per-app routing in Windows Settings → Sound → App volume & device preferences (set each app you want captured to `CABLE Input`). The auto monitor logic enables FFplay so you can still hear the routed app.
- **Stereo Mix** — built into some sound cards. Enable in Sound Control Panel → Recording → right-click → Show Disabled Devices → Enable.

### macOS (AVFoundation)

macOS has no built-in loopback. Install one virtual driver:

- **BlackHole 2ch** (recommended, free, open source) — `brew install blackhole-2ch` (the installer offers this). Manual install: `https://existential.audio/blackhole/`. After install, open **Audio MIDI Setup** → create a **Multi-Output Device** that includes BOTH your speakers/headset AND `BlackHole 2ch`, then set that Multi-Output Device as the macOS System Output. Now whatever your apps play is both audible and captured.
- **Loopback by Rogue Amoeba** (paid, polished routing UI) — `https://rogueamoeba.com/loopback/`.
- **Soundflower** — legacy, only if already installed.

macOS will prompt your terminal app (Terminal / iTerm / VS Code) for **Microphone** permission the first time FFmpeg opens an audio device. Grant it and re-run.

### Linux (PulseAudio / PipeWire-Pulse)

PulseAudio gives you system-audio loopback for free. Every output device has a corresponding `*.monitor` source that captures whatever is being played.

- Ubuntu 22.04+ ships PipeWire by default — install the Pulse compatibility layer: `sudo apt-get install -y pipewire-pulse`.
- Older Ubuntu/Debian/Fedora/Arch: install `pulseaudio` via the system package manager.
- Verify: `pactl list sources short | grep monitor` should show entries like `alsa_output.pci-0000_00_1f.3.analog-stereo.monitor`.

If no loopback source is detected at runtime, the CLI prints platform-specific install guidance and exits without launching anything.

## Quick start

Just go live:

```bash
streamscribe live
```

On first run, an interactive picker lists your real capture devices and asks you to pick a playback source and a microphone. On Linux for example:

```
First-time setup: pick your audio sources.

Playback source (any app's audio — Chrome, Zoom, Spotify, etc.):
  1) alsa_output.pci-0000_00_1f.3.analog-stereo.monitor  [PulseAudio monitor — native loopback, no extra driver needed]
  c) cancel

> 1

Microphone (pick one of your attached mics):
  1) alsa_input.pci-0000_00_1f.3.analog-stereo
  2) bluez_source.AA_BB_CC_DD.headset_head_unit
  c) cancel

> 1

Saved to: /home/<you>/.config/streamscribe/recorder.config.json
```

The macOS and Windows lists name AVFoundation and DirectShow devices respectively — same picker, platform-appropriate device names.

The selection is saved. Subsequent `streamscribe live` runs skip the picker. Use `streamscribe live --pick` or `streamscribe pick` to re-prompt.

Live mode prints final transcript lines to the terminal as `[time] [playback] text` and `[time] [microphone] text`. Press `q`, `Enter`, or `Ctrl+C` to stop.

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

- `browser.backend` and `mic.backend` — FFmpeg input backend, written by the picker:
  - Windows → `dshow` (or legacy `wasapi` / `wasapi-loopback`)
  - macOS → `avfoundation`
  - Linux → `pulse`
- `browser.device` — playback source name (JSON key is `browser` for backward compat; it captures any app's playback)
- `mic.device` — microphone device name
- `monitor.enabled` — `"auto"` | `true` | `false`. `"auto"` is the default:
  - **on** for exclusive sinks where the routed app no longer plays through the system output: `CABLE Output`, `BlackHole`, `Multi-Output Device`, `Loopback Audio`.
  - **off** for parallel taps where the user already hears audio natively: `virtual-audio-capturer`, `Stereo Mix`, PulseAudio `*.monitor` sources, `wasapi-loopback`, and any `pulse` backend.

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
    "printInterim": false,
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

The shape of this depends on whether your loopback source is a **parallel tap** (audio is also still played through your speakers/headset) or an **exclusive sink** (the routed app plays only into the virtual device). The CLI's `monitor.enabled: "auto"` mode picks for you.

### Parallel taps (no FFplay monitor needed)

You keep hearing audio natively, and the CLI captures it in parallel:

- **Windows:** `virtual-audio-capturer` (from screen-capture-recorder), `Stereo Mix`.
- **Linux:** any PulseAudio `*.monitor` source (e.g. `alsa_output...analog-stereo.monitor`). This is the default Linux experience.
- **macOS:** a **Multi-Output Device** in Audio MIDI Setup that includes BlackHole AND your speakers. Set this as the macOS System Output and you both hear and capture audio.

### Exclusive sinks (FFplay monitor runs automatically)

The routed app no longer plays through your default output, so the CLI runs FFplay to play the loopback stream back so you can still hear it:

- **Windows:** VB-CABLE (`CABLE Output`). Route only the app(s) you want captured to `CABLE Input` in Windows Settings → Sound → App volume & device preferences. Don't set the whole Windows default output to VB-CABLE unless you intentionally want all system audio captured.
- **macOS:** `BlackHole 2ch` directly (without a Multi-Output Device) or Rogue Amoeba's `Loopback Audio`. The FFplay monitor plays the captured audio back to the default output.

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
