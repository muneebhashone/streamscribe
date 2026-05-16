# Chrome + microphone Deepgram live STT

Terminal-only Bun + TypeScript audio app for two separate Windows audio sources:

- Chrome/system playback, usually from `CABLE Output (VB-Audio Virtual Cable)`
- direct system microphone, usually from a DirectShow microphone device

`bun start` streams each source to its own Deepgram live STT websocket using `nova-3` by default and prints live transcripts in the terminal. Deepgram TTS support remains in the code, but live mode keeps it disabled by default so the audio you hear is the original audio, not a Deepgram voice.

The WAV recorder is available with `bun run record`.

## Requirements

1. Bun 1.3+
2. FFmpeg and FFplay available on `PATH`
3. A Deepgram API key in `DEEPGRAM_API_KEY`
4. Windows audio permissions for microphone access
5. A loopback/recording device for Chrome/system playback, such as VB-CABLE

Check Bun and FFmpeg/FFplay:

```bash
bun --version
ffmpeg -version
ffplay -version
```

Install dependencies:

```bash
bun install
```

Set your Deepgram API key in the shell before live mode, or put it in the project `.env` file. Bun automatically loads `.env`.

```bash
export DEEPGRAM_API_KEY="your_deepgram_key_here"
```

Example `.env`:

```text
DEEPGRAM_API_KEY=your_deepgram_key_here
```

## Usage

List available devices:

```bash
bun run devices
```

Start live Deepgram STT text output for both channels:

```bash
bun start
# or
bun run live
```

Live mode prints transcripts to the terminal as `[time] [browser] text` and `[time] [microphone] text`. Deepgram TTS is not used. Press `q`, `Enter`, or `Ctrl+C` to stop.

Recording mode:

```bash
bun run record
```

Recordings are written to `recordings/recording-YYYY-MM-DD_HH-mm-ss.wav` with Chrome/system playback on the left channel and microphone on the right channel.

## Configuration

Edit `recorder.config.json`.

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

## Deepgram live STT separation

Live mode does not merge the sources before transcription. It starts two FFmpeg capture pipelines and two Deepgram live STT websocket connections:

- browser/system source -> one mono 16 kHz `linear16` Deepgram stream
- microphone source -> one mono 16 kHz `linear16` Deepgram stream

That keeps the channels separate for Deepgram live STT. Final transcripts from both streams are printed in the terminal. Interim transcripts are also shown in-place when `deepgram.printInterim` is `true`.

Deepgram TTS is disabled by default (`deepgram.ttsEnabled: false`) and is not used by live mode. If Chrome is routed to VB-CABLE and you still want to hear the original browser audio, keep `monitor.enabled: true`; the app will monitor `CABLE Output` through FFplay and play that original audio to the Windows default playback device.

## Capturing Chrome audio

A normal microphone appears to FFmpeg as a capture device, but Chrome audio usually does not. For isolated Chrome capture, route Chrome to a virtual audio playback device and record the matching capture endpoint.

Common options:

- VB-CABLE: route only Chrome to `CABLE Input`, record `CABLE Output`.
- screen-capture-recorder: record `virtual-audio-capturer`.
- Stereo Mix: records broader system playback if your driver exposes it.

For the “hear original audio in headset while transcribing separately” setup, do not set the whole Windows default playback device to VB-CABLE. Set Windows default playback to your headset, then route Chrome/app audio specifically to `CABLE Input` in Windows App volume/device preferences. The app captures `CABLE Output` for transcription and its monitor plays that same original audio to the default headset.

After installing/routing, run:

```bash
bun run devices
```

Then set `browser.device` exactly as FFmpeg prints it.

## Development

```bash
bun test          # unit tests
bun run typecheck # TypeScript strict typecheck
bun run check     # tests + typecheck
```

Project layout:

- `src/cli.ts` - Bun CLI entrypoint
- `src/lib.ts` - typed configuration, FFmpeg args, Deepgram websocket, recorder/live logic
- `tests/lib.test.ts` - unit tests for pure behavior

## Commands

```bash
bun start         # live Deepgram STT text output, no Deepgram TTS, no recording
bun run live      # same as bun start
bun run record    # stereo WAV recording
bun run devices   # list DirectShow/WASAPI devices
bun test          # test suite
bun run typecheck # TypeScript typecheck
bun run check     # tests + typecheck
```
