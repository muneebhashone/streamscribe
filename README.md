# Chrome + microphone Deepgram live STT/TTS

Terminal-only Node.js audio app for two separate Windows audio sources:

- Chrome/system playback, usually from `CABLE Output (VB-Audio Virtual Cable)`
- direct system microphone, usually from a DirectShow microphone device

`npm start` streams each source to its own Deepgram live STT websocket using the latest Nova model configured here (`nova-3`) and prints live transcripts in the terminal. Deepgram TTS is disabled by default; the audio you hear should be the original audio, not a Deepgram voice.

The old WAV recorder is still available with `npm run record`.

## Requirements

1. Node.js 18+
2. FFmpeg and FFplay available on `PATH`
3. A Deepgram API key in `DEEPGRAM_API_KEY`
4. Windows audio permissions for microphone access
5. A loopback/recording device for Chrome/system playback, such as VB-CABLE

Check FFmpeg/FFplay:

```bash
ffmpeg -version
ffplay -version
```

Set your Deepgram API key in the shell before live mode, or put it in the project `.env` file:

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
npm run devices
```

Start live Deepgram STT text output for both channels:

```bash
npm start
# or
npm run live
```

Live mode prints transcripts to the terminal as `[time] [browser] text` and `[time] [microphone] text`. Deepgram TTS is not used. The project `.npmrc` sets `loglevel=silent`, so `npm start` does not print the usual npm script banner. Press `q`, `Enter`, or `Ctrl+C` to stop.

Optional legacy recording mode:

```bash
npm run record
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

### Deepgram live STT separation

Live mode does not merge the sources before transcription. It starts two FFmpeg capture pipelines and two Deepgram live STT websocket connections:

- browser/system source -> one mono 16 kHz `linear16` Deepgram stream
- microphone source -> one mono 16 kHz `linear16` Deepgram stream

That keeps the channels separate for Deepgram live STT. Final transcripts from both streams are printed in the terminal. Interim transcripts are also shown in-place when `deepgram.printInterim` is `true`.

Deepgram TTS is disabled by default (`deepgram.ttsEnabled: false`) and is not used by live mode. If Chrome is routed to VB-CABLE and you still want to hear the original browser audio, keep `monitor.enabled: true`; the app will monitor `CABLE Output` through FFplay and play that original audio to the Windows default playback device.

### Terminal output

Live mode uses:

- FFmpeg `-loglevel error`
- child-process stderr ignored unless `deepgram.debug` is `true`
- `console.log` for final transcripts
- in-place terminal updates for interim transcripts when `deepgram.printInterim` is `true`
- project `.npmrc` with `loglevel=silent` to suppress npm's script banner

If you need troubleshooting output, set:

```json
"debug": true
```

inside the `deepgram` object.

### Capturing Chrome audio

A normal microphone appears to FFmpeg as a capture device, but Chrome audio usually does not. For isolated Chrome capture, route Chrome to a virtual audio playback device and record the matching capture endpoint.

Common options:

- VB-CABLE: route only Chrome to `CABLE Input`, record `CABLE Output`.
- screen-capture-recorder: record `virtual-audio-capturer`.
- Stereo Mix: records broader system playback if your driver exposes it.

For the “hear original audio in headset while transcribing separately” setup, do not set the whole Windows default playback device to VB-CABLE. Set Windows default playback to your headset, then route Chrome/app audio specifically to `CABLE Input` in Windows App volume/device preferences. The app captures `CABLE Output` for transcription and its monitor plays that same original audio to the default headset.

After installing/routing, run:

```bash
npm run devices
```

Then set `browser.device` exactly as FFmpeg prints it.

### Selecting the system microphone

The microphone is captured directly from Windows/DirectShow, not from Chrome. Run:

```bash
npm run devices
```

Then set `mic.device` exactly as FFmpeg prints it.

## Commands

```bash
npm start       # live Deepgram STT text output, no Deepgram TTS, no recording
npm run live    # same as npm start
npm run record  # legacy stereo WAV recording
npm run devices # list DirectShow/WASAPI devices
npm run check   # syntax check
```
