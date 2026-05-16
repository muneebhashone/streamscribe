import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import {
  buildFfmpegArgs,
  buildLiveCaptureArgs,
  buildMonitorArgs,
  classifyDevice,
  deepgramListenUrl,
  filterMicSources,
  filterPlaybackSources,
  inputArgs,
  isConfigUsable,
  mergeConfig,
  monitorShouldRun,
  parseDshowDevices,
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
});

describe('Deepgram helpers', () => {
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
  test('classifies known loopback devices as loopback', () => {
    expect(classifyDevice('virtual-audio-capturer')).toBe('loopback');
    expect(classifyDevice('CABLE Output (VB-Audio Virtual Cable)')).toBe('loopback');
    expect(classifyDevice('Stereo Mix (Realtek HD Audio)')).toBe('loopback');
    expect(classifyDevice('VoiceMeeter Out B1 (VB-Audio VoiceMeeter)')).toBe('loopback');
  });

  test('classifies physical mics as mic', () => {
    expect(classifyDevice('Headset Microphone (Plantronics Blackwire 3220 Series)')).toBe('mic');
    expect(classifyDevice('Microphone Array (Realtek HD Audio)')).toBe('mic');
    expect(classifyDevice('Microphone (USB Audio Device)')).toBe('mic');
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
