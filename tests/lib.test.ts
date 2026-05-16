import { describe, expect, test } from 'bun:test';
import {
  buildFfmpegArgs,
  buildLiveCaptureArgs,
  buildMonitorArgs,
  deepgramListenUrl,
  inputArgs,
  mergeConfig,
  timestampForDate,
} from '../src/lib';

const baseConfig = mergeConfig({
  outputDir: 'recordings',
  sampleRate: 48000,
  monitor: { enabled: true, ffplayPath: 'ffplay', volume: 50 },
  deepgram: { sttSampleRate: 16000, language: 'en-US', interimResults: true },
  browser: { backend: 'dshow', device: 'CABLE Output (VB-Audio Virtual Cable)', label: 'Browser', ttsName: 'browser' },
  mic: { backend: 'dshow', device: 'Headset Microphone', label: 'Mic', ttsName: 'microphone' },
});

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
    expect(config.browser.device).toBe('CABLE Output (VB-Audio Virtual Cable)');
  });

  test('formats timestamps with local date parts', () => {
    expect(timestampForDate(new Date(2026, 4, 17, 1, 2, 3))).toBe('2026-05-17_01-02-03');
  });
});
