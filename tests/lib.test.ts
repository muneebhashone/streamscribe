import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import {
  backendForSource,
  buildFfmpegArgs,
  buildLiveCaptureArgs,
  buildMonitorArgs,
  classifyDevice,
  createTranscriptPrinter,
  currentPlatform,
  defaultConfig,
  deepgramListenUrl,
  filterMicSources,
  filterPlaybackSources,
  indevsToCapabilities,
  inputArgs,
  isConfigUsable,
  mergeConfig,
  monitorShouldRun,
  parseAvfoundationDevices,
  parseDshowDevices,
  parseIndevsList,
  parsePulseSources,
  platformDefaults,
  readPackageVersion,
  timestampForDate,
} from '../src/lib';

const projectRoot = resolve(import.meta.dir, '..');

const baseConfig = mergeConfig({
  outputDir: 'recordings',
  sampleRate: 48000,
  monitor: { enabled: true, ffplayPath: 'ffplay', volume: 50 },
  deepgram: { sttSampleRate: 16000, language: 'en-US', interimResults: true },
  browser: { backend: 'dshow', device: 'CABLE Output (VB-Audio Virtual Cable)', label: 'Browser', ttsName: 'browser' },
  mic: { backend: 'dshow', device: 'Headset Microphone', label: 'Mic', ttsName: 'microphone' },
});

const SAMPLE_DSHOW_STDERR = `
[dshow @ 000001b7] DirectShow video devices (some may be both video and audio devices)
[dshow @ 000001b7]  "Integrated Webcam" (video)
[dshow @ 000001b7]     Alternative name "@device_pnp_..."
[dshow @ 000001b7] DirectShow audio devices
[dshow @ 000001b7]  "Headset Microphone (Plantronics Blackwire 3220 Series)" (audio)
[dshow @ 000001b7]     Alternative name "@device_cm_..."
[dshow @ 000001b7]  "Microphone Array (Realtek HD Audio)" (audio)
[dshow @ 000001b7]     Alternative name "@device_cm_..."
[dshow @ 000001b7]  "CABLE Output (VB-Audio Virtual Cable)" (audio)
[dshow @ 000001b7]     Alternative name "@device_cm_..."
[dshow @ 000001b7]  "virtual-audio-capturer" (audio)
[dshow @ 000001b7]     Alternative name "@device_sw_..."
[dshow @ 000001b7]  "Stereo Mix (Realtek HD Audio)" (audio)
[dshow @ 000001b7]     Alternative name "@device_cm_..."
`;

describe('inputArgs', () => {
  test('builds DirectShow args with audio= prefix', () => {
    expect(inputArgs({ backend: 'dshow', device: 'Microphone' })).toEqual(['-f', 'dshow', '-i', 'audio=Microphone']);
  });

  test('uses audio=default for DirectShow default device', () => {
    expect(inputArgs({ backend: 'dshow', device: 'default' })).toEqual(['-f', 'dshow', '-i', 'audio=default']);
  });

  test('builds WASAPI loopback args', () => {
    expect(inputArgs({ backend: 'wasapi-loopback', device: 'Speakers' })).toEqual(['-f', 'wasapi', '-loopback', '1', '-i', 'Speakers']);
  });

  test('rejects unsupported backends', () => {
    expect(() => inputArgs({ backend: 'alsa', device: 'default' })).toThrow('Unsupported backend');
  });

  test('builds AVFoundation args with leading colon for audio-only', () => {
    expect(inputArgs({ backend: 'avfoundation', device: 'BlackHole 2ch' })).toEqual(['-f', 'avfoundation', '-i', ':BlackHole 2ch']);
  });

  test('uses :default for AVFoundation default device', () => {
    expect(inputArgs({ backend: 'avfoundation', device: 'default' })).toEqual(['-f', 'avfoundation', '-i', ':default']);
    expect(inputArgs({ backend: 'avfoundation', device: '' })).toEqual(['-f', 'avfoundation', '-i', ':default']);
  });

  test('builds PulseAudio args with raw source name', () => {
    expect(inputArgs({ backend: 'pulse', device: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor' }))
      .toEqual(['-f', 'pulse', '-i', 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor']);
  });

  test('uses "default" for PulseAudio when device is empty', () => {
    expect(inputArgs({ backend: 'pulse', device: 'default' })).toEqual(['-f', 'pulse', '-i', 'default']);
    expect(inputArgs({ backend: 'pulse', device: '' })).toEqual(['-f', 'pulse', '-i', 'default']);
  });
});

describe('platform defaults', () => {
  test('currentPlatform maps node platform names to friendly ids', () => {
    expect(currentPlatform('win32')).toBe('windows');
    expect(currentPlatform('darwin')).toBe('macos');
    expect(currentPlatform('linux')).toBe('linux');
    expect(currentPlatform('freebsd')).toBe('linux');
  });

  test('platformDefaults returns dshow on Windows', () => {
    expect(platformDefaults('win32')).toEqual({ id: 'windows', backend: 'dshow', source: 'dshow' });
  });

  test('platformDefaults returns avfoundation on macOS', () => {
    expect(platformDefaults('darwin')).toEqual({ id: 'macos', backend: 'avfoundation', source: 'avfoundation' });
  });

  test('platformDefaults returns pulse on Linux', () => {
    expect(platformDefaults('linux')).toEqual({ id: 'linux', backend: 'pulse', source: 'pulse' });
  });

  test('backendForSource maps discovered sources to backends', () => {
    expect(backendForSource('dshow')).toBe('dshow');
    expect(backendForSource('avfoundation')).toBe('avfoundation');
    expect(backendForSource('pulse')).toBe('pulse');
    expect(backendForSource('wasapi')).toBe('wasapi');
  });
});

describe('FFmpeg argument builders', () => {
  test('builds stereo WAV recorder graph with browser left and mic right', () => {
    const args = buildFfmpegArgs(baseConfig, 'out.wav');

    expect(args).toContain('-filter_complex');
    expect(args.join(' ')).toContain('[0:a]aresample=48000');
    expect(args.join(' ')).toContain('[1:a]aresample=48000');
    expect(args.join(' ')).toContain('amerge=inputs=2,pan=stereo|c0=c0|c1=c1[out]');
    expect(args.slice(-9)).toEqual(['-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', 'out.wav']);
  });

  test('builds mono 16 kHz raw PCM live capture args', () => {
    expect(buildLiveCaptureArgs(baseConfig, baseConfig.browser)).toEqual([
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'dshow',
      '-i', 'audio=CABLE Output (VB-Audio Virtual Cable)',
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      'pipe:1',
    ]);
  });

  test('builds legacy monitor capture args with volume filter', () => {
    expect(buildMonitorArgs(baseConfig)).toEqual([
      '-hide_banner',
      '-nodisp',
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-f', 'dshow',
      '-i', 'audio=CABLE Output (VB-Audio Virtual Cable)',
      '-af', 'volume=0.5',
    ]);
  });

  test('builds monitor args for AVFoundation on macOS', () => {
    const config = mergeConfig({
      monitor: { enabled: 'auto', ffplayPath: 'ffplay', volume: 100 },
      browser: { backend: 'avfoundation', device: 'BlackHole 2ch' },
    });
    expect(buildMonitorArgs(config)).toEqual([
      '-hide_banner',
      '-nodisp',
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-f', 'avfoundation',
      '-i', ':BlackHole 2ch',
    ]);
  });

  test('builds monitor args for PulseAudio on Linux', () => {
    const config = mergeConfig({
      monitor: { enabled: 'auto', ffplayPath: 'ffplay', volume: 100 },
      browser: { backend: 'pulse', device: 'alsa_output.foo.monitor' },
    });
    expect(buildMonitorArgs(config)).toEqual([
      '-hide_banner',
      '-nodisp',
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-f', 'pulse',
      '-i', 'alsa_output.foo.monitor',
    ]);
  });
});

describe('Deepgram helpers', () => {
  test('defaults to final transcript printing only', () => {
    expect(defaultConfig.deepgram.printInterim).toBe(false);
  });

  test('builds a Deepgram STT URL with configured query params', () => {
    const url = new URL(deepgramListenUrl(baseConfig.deepgram));
    expect(url.protocol).toBe('wss:');
    expect(url.hostname).toBe('api.deepgram.com');
    expect(url.pathname).toBe('/v1/listen');
    expect(url.searchParams.get('model')).toBe('nova-3');
    expect(url.searchParams.get('encoding')).toBe('linear16');
    expect(url.searchParams.get('sample_rate')).toBe('16000');
    expect(url.searchParams.get('language')).toBe('en-US');
  });
});

describe('createTranscriptPrinter', () => {
  test('prints final transcript lines append-only', () => {
    const originalLog = console.log;
    const originalWrite = process.stdout.write;
    const logs: string[] = [];
    const writes: string[] = [];

    console.log = (message?: unknown) => { logs.push(String(message)); };
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const print = createTranscriptPrinter();
      print({ text: 'hello from the call', source: { label: 'Microphone', ttsName: 'microphone' }, isFinal: true });
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^\[00:00\] \[microphone\] hello from the call$/);
    expect(writes).toEqual([]);
  });

  test('still supports explicit interim output', () => {
    const originalLog = console.log;
    const originalWrite = process.stdout.write;
    const logs: string[] = [];
    const writes: string[] = [];

    console.log = (message?: unknown) => { logs.push(String(message)); };
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const print = createTranscriptPrinter();
      print({ text: 'partial phrase', source: { label: 'Playback', ttsName: 'playback' }, isFinal: false });
      print({ text: 'partial phrase complete', source: { label: 'Playback', ttsName: 'playback' }, isFinal: true });
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }

    expect(writes[0]).toMatch(/^\r\[00:00\] \[playback\] partial phrase \.\.\.$/);
    expect(writes[1]).toMatch(/^\r +\r$/);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^\[00:00\] \[playback\] partial phrase complete$/);
  });
});

describe('readPackageVersion', () => {
  test('reads the version from package.json', () => {
    expect(readPackageVersion(projectRoot)).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('returns 0.0.0 when package.json is missing', () => {
    expect(readPackageVersion('/no/such/dir')).toBe('0.0.0');
  });
});

describe('configuration helpers', () => {
  test('deep merges user config onto defaults', () => {
    const config = mergeConfig({
      monitor: { enabled: false },
      deepgram: { debug: true },
      mic: { device: 'Custom Mic' },
    });

    expect(config.monitor.enabled).toBe(false);
    expect(config.monitor.ffplayPath).toBe('ffplay');
    expect(config.deepgram.debug).toBe(true);
    expect(config.deepgram.sttModel).toBe('nova-3');
    expect(config.mic.device).toBe('Custom Mic');
    expect(config.browser.device).toBe('');
  });

  test('defaults monitor.enabled to "auto"', () => {
    expect(mergeConfig().monitor.enabled).toBe('auto');
  });

  test('formats timestamps with local date parts', () => {
    expect(timestampForDate(new Date(2026, 4, 17, 1, 2, 3))).toBe('2026-05-17_01-02-03');
  });
});

describe('classifyDevice', () => {
  test('classifies known Windows loopback devices as loopback', () => {
    expect(classifyDevice('virtual-audio-capturer')).toBe('loopback');
    expect(classifyDevice('CABLE Output (VB-Audio Virtual Cable)')).toBe('loopback');
    expect(classifyDevice('Stereo Mix (Realtek HD Audio)')).toBe('loopback');
    expect(classifyDevice('VoiceMeeter Out B1 (VB-Audio VoiceMeeter)')).toBe('loopback');
  });

  test('classifies known macOS loopback devices as loopback', () => {
    expect(classifyDevice('BlackHole 2ch')).toBe('loopback');
    expect(classifyDevice('BlackHole 16ch')).toBe('loopback');
    expect(classifyDevice('Soundflower (2ch)')).toBe('loopback');
    expect(classifyDevice('Loopback Audio')).toBe('loopback');
    expect(classifyDevice('Multi-Output Device')).toBe('loopback');
  });

  test('classifies PulseAudio monitor sources as loopback', () => {
    expect(classifyDevice('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor')).toBe('loopback');
    expect(classifyDevice('Monitor of Built-in Audio Analog Stereo')).toBe('loopback');
  });

  test('classifies physical mics as mic', () => {
    expect(classifyDevice('Headset Microphone (Plantronics Blackwire 3220 Series)')).toBe('mic');
    expect(classifyDevice('Microphone Array (Realtek HD Audio)')).toBe('mic');
    expect(classifyDevice('Microphone (USB Audio Device)')).toBe('mic');
    expect(classifyDevice('Built-in Microphone')).toBe('mic');
    expect(classifyDevice('alsa_input.pci-0000_00_1f.3.analog-stereo')).toBe('mic');
  });
});

describe('parseDshowDevices', () => {
  test('extracts audio devices from ffmpeg -list_devices stderr', () => {
    const devices = parseDshowDevices(SAMPLE_DSHOW_STDERR);
    const names = devices.map(d => d.name);
    expect(names).toContain('Headset Microphone (Plantronics Blackwire 3220 Series)');
    expect(names).toContain('Microphone Array (Realtek HD Audio)');
    expect(names).toContain('CABLE Output (VB-Audio Virtual Cable)');
    expect(names).toContain('virtual-audio-capturer');
    expect(names).toContain('Stereo Mix (Realtek HD Audio)');
    expect(names).not.toContain('Integrated Webcam');
  });

  test('classifies each parsed device', () => {
    const devices = parseDshowDevices(SAMPLE_DSHOW_STDERR);
    const byName = Object.fromEntries(devices.map(d => [d.name, d.kind]));
    expect(byName['virtual-audio-capturer']).toBe('loopback');
    expect(byName['CABLE Output (VB-Audio Virtual Cable)']).toBe('loopback');
    expect(byName['Stereo Mix (Realtek HD Audio)']).toBe('loopback');
    expect(byName['Headset Microphone (Plantronics Blackwire 3220 Series)']).toBe('mic');
    expect(byName['Microphone Array (Realtek HD Audio)']).toBe('mic');
  });

  test('deduplicates repeated device names', () => {
    const repeated = `${SAMPLE_DSHOW_STDERR}\n[dshow @ x]  "virtual-audio-capturer" (audio)`;
    const devices = parseDshowDevices(repeated);
    expect(devices.filter(d => d.name === 'virtual-audio-capturer')).toHaveLength(1);
  });

  test('returns empty array when no devices in input', () => {
    expect(parseDshowDevices('no devices here')).toEqual([]);
  });
});

describe('parseIndevsList (ffmpeg -devices)', () => {
  test('detects pulse on the real Ubuntu 24.04 + ffmpeg 6.1.1 listing (DE marker, glued)', () => {
    const real = `Devices:
 D. = Demuxing supported
 .E = Muxing supported
 --
 DE alsa            ALSA audio output
 DE fbdev           Linux framebuffer
 D  iec61883        libiec61883 (new DV1394) A/V input device
 D  jack            JACK Audio Connection Kit
 D  kmsgrab         KMS screen capture
 D  lavfi           Libavfilter virtual input device
 D  libcdio
 D  libdc1394       dc1394 v.2 A/V grab
 D  openal          OpenAL audio capture device
  E opengl          OpenGL output
 DE oss             OSS (Open Sound System) playback
 DE pulse           Pulse audio output
  E sdl,sdl2        SDL2 output device
 DE video4linux2,v4l2 Video4Linux2 output device
 D  x11grab         X11 screen capture, using XCB
  E xv              XV (XVideo) output device
`;
    const indevs = parseIndevsList(real);
    expect(indevs.has('pulse')).toBe(true);
    expect(indevs.has('alsa')).toBe(true);
    expect(indevs.has('lavfi')).toBe(true);
    expect(indevs.has('opengl')).toBe(false);
    expect(indevs.has('sdl,sdl2')).toBe(false);
  });

  test('detects dshow on Windows ffmpeg builds (D  marker)', () => {
    const text = `
 D  dshow           DirectShow capture
 DE lavfi           Libavfilter virtual input device
  E null            raw null video output
`;
    const indevs = parseIndevsList(text);
    expect(indevs.has('dshow')).toBe(true);
    expect(indevs.has('lavfi')).toBe(true);
    expect(indevs.has('null')).toBe(false);
  });

  test('indevsToCapabilities maps a set into the capability flags', () => {
    expect(indevsToCapabilities(new Set(['dshow']))).toEqual({ hasDshow: true, hasWasapi: false, hasAvfoundation: false, hasPulse: false });
    expect(indevsToCapabilities(new Set(['avfoundation']))).toEqual({ hasDshow: false, hasWasapi: false, hasAvfoundation: true, hasPulse: false });
    expect(indevsToCapabilities(new Set(['pulse']))).toEqual({ hasDshow: false, hasWasapi: false, hasAvfoundation: false, hasPulse: true });
    expect(indevsToCapabilities(new Set(['dshow', 'wasapi']))).toEqual({ hasDshow: true, hasWasapi: true, hasAvfoundation: false, hasPulse: false });
  });
});

describe('parseAvfoundationDevices', () => {
  const sample = `
[AVFoundation indev @ 0x7fb31cf04680] AVFoundation video devices:
[AVFoundation indev @ 0x7fb31cf04680] [0] FaceTime HD Camera (Built-in)
[AVFoundation indev @ 0x7fb31cf04680] [1] Capture screen 0
[AVFoundation indev @ 0x7fb31cf04680] AVFoundation audio devices:
[AVFoundation indev @ 0x7fb31cf04680] [0] Built-in Microphone
[AVFoundation indev @ 0x7fb31cf04680] [1] BlackHole 2ch
[AVFoundation indev @ 0x7fb31cf04680] [2] Multi-Output Device
`;

  test('extracts only audio devices from AVFoundation listing', () => {
    const devices = parseAvfoundationDevices(sample);
    const names = devices.map(d => d.name);
    expect(names).toEqual(['Built-in Microphone', 'BlackHole 2ch', 'Multi-Output Device']);
    expect(devices.every(d => d.source === 'avfoundation')).toBe(true);
  });

  test('classifies AVFoundation devices correctly', () => {
    const devices = parseAvfoundationDevices(sample);
    const byName = Object.fromEntries(devices.map(d => [d.name, d.kind]));
    expect(byName['Built-in Microphone']).toBe('mic');
    expect(byName['BlackHole 2ch']).toBe('loopback');
    expect(byName['Multi-Output Device']).toBe('loopback');
  });

  test('returns empty array when no audio header is present', () => {
    expect(parseAvfoundationDevices('no audio header here')).toEqual([]);
  });
});

describe('parsePulseSources', () => {
  const sample = `
Auto-detected sources for pulse:
  alsa_input.pci-0000_00_1f.3.analog-stereo
  alsa_output.pci-0000_00_1f.3.analog-stereo.monitor
  bluez_source.AA_BB_CC_DD_EE_FF.headset_head_unit
`;

  test('extracts source names from ffmpeg -sources pulse output', () => {
    const devices = parsePulseSources(sample);
    const names = devices.map(d => d.name);
    expect(names).toContain('alsa_input.pci-0000_00_1f.3.analog-stereo');
    expect(names).toContain('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
    expect(names).toContain('bluez_source.AA_BB_CC_DD_EE_FF.headset_head_unit');
    expect(devices.every(d => d.source === 'pulse')).toBe(true);
  });

  test('classifies .monitor sources as loopback', () => {
    const devices = parsePulseSources(sample);
    const byName = Object.fromEntries(devices.map(d => [d.name, d.kind]));
    expect(byName['alsa_output.pci-0000_00_1f.3.analog-stereo.monitor']).toBe('loopback');
    expect(byName['alsa_input.pci-0000_00_1f.3.analog-stereo']).toBe('mic');
  });

  test('returns empty array when no source header is present', () => {
    expect(parsePulseSources('no pulse output')).toEqual([]);
  });

  test('parses ffmpeg marker format with descriptions', () => {
    const markerFormat = `
[pulse @ 0x55a98b07eb40] PulseAudio sources:
  > alsa_input.pci-0000_00_1f.3.analog-stereo [Built-in Audio Analog Stereo]
  > alsa_output.pci-0000_00_1f.3.analog-stereo.monitor [Monitor of Built-in Audio Analog Stereo]
  * bluez_source.AA_BB_CC_DD.headset [USB Headset]
`;
    const devices = parsePulseSources(markerFormat);
    const names = devices.map(d => d.name);
    expect(names).toContain('alsa_input.pci-0000_00_1f.3.analog-stereo');
    expect(names).toContain('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
    expect(names).toContain('bluez_source.AA_BB_CC_DD.headset');
    const byName = Object.fromEntries(devices.map(d => [d.name, d.kind]));
    expect(byName['alsa_output.pci-0000_00_1f.3.analog-stereo.monitor']).toBe('loopback');
  });

  test('classifies "Monitor of X" descriptions as loopback even if internal name lacks .monitor', () => {
    const text = `
Auto-detected sources for pulse:
  > weird_internal_name [Monitor of Built-in Audio]
`;
    const devices = parsePulseSources(text);
    expect(devices).toHaveLength(1);
    expect(devices[0]?.kind).toBe('loopback');
  });

  test('skips the "default" alias to avoid double-listing', () => {
    const text = `
Auto-detected sources for pulse:
  * default
  > alsa_input.foo
`;
    const devices = parsePulseSources(text);
    expect(devices.map(d => d.name)).toEqual(['alsa_input.foo']);
  });

  test('parses real ffmpeg 6.x output with trailing (none) annotation (captured on Ubuntu 24.04 + WSLg pulse)', () => {
    const real = `Auto-detected sources for pulse:
  RDPSink.monitor [Monitor of RDP Sink] (none)
* RDPSource [RDP Source] (none)
`;
    const devices = parsePulseSources(real);
    expect(devices.map(d => d.name)).toEqual(['RDPSink.monitor', 'RDPSource']);
    const byName = Object.fromEntries(devices.map(d => [d.name, d.kind]));
    expect(byName['RDPSink.monitor']).toBe('loopback');
    expect(byName['RDPSource']).toBe('mic');
  });
});

describe('filterPlaybackSources / filterMicSources', () => {
  const devices = parseDshowDevices(SAMPLE_DSHOW_STDERR);

  test('playback filter returns only loopback devices', () => {
    const names = filterPlaybackSources(devices).map(d => d.name).sort();
    expect(names).toEqual([
      'CABLE Output (VB-Audio Virtual Cable)',
      'Stereo Mix (Realtek HD Audio)',
      'virtual-audio-capturer',
    ]);
  });

  test('mic filter returns only physical mics', () => {
    const names = filterMicSources(devices).map(d => d.name).sort();
    expect(names).toEqual([
      'Headset Microphone (Plantronics Blackwire 3220 Series)',
      'Microphone Array (Realtek HD Audio)',
    ]);
  });
});

describe('monitorShouldRun', () => {
  test('explicit false disables monitor regardless of source', () => {
    const config = mergeConfig({ monitor: { enabled: false }, browser: { device: 'CABLE Output (VB-Audio Virtual Cable)' } });
    expect(monitorShouldRun(config)).toBe(false);
  });

  test('explicit true enables monitor regardless of source', () => {
    const config = mergeConfig({ monitor: { enabled: true }, browser: { device: 'virtual-audio-capturer' } });
    expect(monitorShouldRun(config)).toBe(true);
  });

  test('auto skips monitor for virtual-audio-capturer (parallel tap)', () => {
    const config = mergeConfig({ monitor: { enabled: 'auto' }, browser: { backend: 'dshow', device: 'virtual-audio-capturer' } });
    expect(monitorShouldRun(config)).toBe(false);
  });

  test('auto skips monitor for Stereo Mix (parallel tap)', () => {
    const config = mergeConfig({ monitor: { enabled: 'auto' }, browser: { backend: 'dshow', device: 'Stereo Mix (Realtek HD Audio)' } });
    expect(monitorShouldRun(config)).toBe(false);
  });

  test('auto enables monitor for CABLE Output (exclusive sink)', () => {
    const config = mergeConfig({ monitor: { enabled: 'auto' }, browser: { backend: 'dshow', device: 'CABLE Output (VB-Audio Virtual Cable)' } });
    expect(monitorShouldRun(config)).toBe(true);
  });

  test('auto skips monitor for wasapi-loopback backend', () => {
    const config = mergeConfig({ monitor: { enabled: 'auto' }, browser: { backend: 'wasapi-loopback', device: 'Speakers' } });
    expect(monitorShouldRun(config)).toBe(false);
  });

  test('auto skips monitor for pulse backend (PulseAudio plays back via monitor parallel-tap)', () => {
    const config = mergeConfig({ monitor: { enabled: 'auto' }, browser: { backend: 'pulse', device: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor' } });
    expect(monitorShouldRun(config)).toBe(false);
  });

  test('auto skips monitor for .monitor source even on other backends', () => {
    const config = mergeConfig({ monitor: { enabled: 'auto' }, browser: { backend: 'dshow', device: 'alsa_output.foo.monitor' } });
    expect(monitorShouldRun(config)).toBe(false);
  });

  test('auto enables monitor for BlackHole on macOS (exclusive sink)', () => {
    const config = mergeConfig({ monitor: { enabled: 'auto' }, browser: { backend: 'avfoundation', device: 'BlackHole 2ch' } });
    expect(monitorShouldRun(config)).toBe(true);
  });

  test('auto enables monitor for Multi-Output Device on macOS', () => {
    const config = mergeConfig({ monitor: { enabled: 'auto' }, browser: { backend: 'avfoundation', device: 'Multi-Output Device' } });
    expect(monitorShouldRun(config)).toBe(true);
  });
});

describe('isConfigUsable', () => {
  const devices = parseDshowDevices(SAMPLE_DSHOW_STDERR);

  test('returns true when both devices appear in live enumeration', () => {
    const config = mergeConfig({
      browser: { device: 'virtual-audio-capturer' },
      mic: { device: 'Headset Microphone (Plantronics Blackwire 3220 Series)' },
    });
    expect(isConfigUsable(config, devices)).toBe(true);
  });

  test('returns false when browser.device is empty', () => {
    const config = mergeConfig({
      browser: { device: '' },
      mic: { device: 'Headset Microphone (Plantronics Blackwire 3220 Series)' },
    });
    expect(isConfigUsable(config, devices)).toBe(false);
  });

  test('returns false when mic.device is empty', () => {
    const config = mergeConfig({
      browser: { device: 'virtual-audio-capturer' },
      mic: { device: '' },
    });
    expect(isConfigUsable(config, devices)).toBe(false);
  });

  test('returns false when configured device is not present', () => {
    const config = mergeConfig({
      browser: { device: 'NonExistent Device' },
      mic: { device: 'Headset Microphone (Plantronics Blackwire 3220 Series)' },
    });
    expect(isConfigUsable(config, devices)).toBe(false);
  });

  test('matches device names case-insensitively', () => {
    const config = mergeConfig({
      browser: { device: 'VIRTUAL-AUDIO-CAPTURER' },
      mic: { device: 'headset microphone (plantronics blackwire 3220 series)' },
    });
    expect(isConfigUsable(config, devices)).toBe(true);
  });
});
