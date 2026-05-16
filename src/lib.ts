import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runPicker } from './picker';

export type AudioBackend = 'dshow' | 'wasapi' | 'wasapi-loopback';

export interface AudioSourceConfig {
  label?: string;
  backend?: AudioBackend | string;
  device?: string;
  channel?: string;
  ttsName?: string;
  ttsModel?: string;
}

export type MonitorEnabled = boolean | 'auto';

export interface MonitorConfig {
  enabled: MonitorEnabled;
  ffplayPath: string;
  volume: number;
}

export type AudioDeviceKind = 'loopback' | 'mic';

export interface DiscoveredDevice {
  name: string;
  kind: AudioDeviceKind;
  source: 'dshow' | 'wasapi';
}

export interface FfmpegCapabilities {
  hasDshow: boolean;
  hasWasapi: boolean;
}

export interface DeepgramConfig {
  apiKeyEnv: string;
  apiKey?: string;
  sttModel: string;
  sttSampleRate: number;
  language?: string;
  interimResults: boolean;
  endpointing: number;
  punctuate: boolean;
  smartFormat: boolean;
  printInterim: boolean;
  ttsEnabled: boolean;
  ttsModel: string;
  ttsSampleRate: number;
  ttsEncoding: string;
  ttsContainer: string;
  speakChannelNames: boolean;
  ffplayPath: string;
  debug: boolean;
}

export interface RecorderConfig {
  ffmpegPath: string;
  outputDir: string;
  sampleRate: number;
  monitor: MonitorConfig;
  deepgram: DeepgramConfig;
  browser: AudioSourceConfig;
  mic: AudioSourceConfig;
}

export type PartialRecorderConfig = Partial<Omit<RecorderConfig, 'monitor' | 'deepgram' | 'browser' | 'mic'>> & {
  monitor?: Partial<MonitorConfig>;
  deepgram?: Partial<DeepgramConfig>;
  browser?: AudioSourceConfig;
  mic?: AudioSourceConfig;
};

export interface RuntimePaths {
  root: string;
  configPath: string;
}

export const defaultConfig: RecorderConfig = {
  ffmpegPath: 'ffmpeg',
  outputDir: 'recordings',
  sampleRate: 48000,
  monitor: { enabled: 'auto', ffplayPath: 'ffplay', volume: 100 },
  deepgram: {
    apiKeyEnv: 'DEEPGRAM_API_KEY',
    sttModel: 'nova-3',
    sttSampleRate: 16000,
    language: 'en-US',
    interimResults: true,
    endpointing: 300,
    punctuate: true,
    smartFormat: true,
    printInterim: true,
    ttsEnabled: false,
    ttsModel: 'aura-2-thalia-en',
    ttsSampleRate: 24000,
    ttsEncoding: 'linear16',
    ttsContainer: 'wav',
    speakChannelNames: false,
    ffplayPath: 'ffplay',
    debug: false,
  },
  browser: {
    label: 'System playback (any app)',
    backend: 'dshow',
    device: '',
    channel: 'left',
    ttsName: 'playback',
  },
  mic: {
    label: 'Microphone',
    backend: 'dshow',
    device: '',
    channel: 'right',
    ttsName: 'microphone',
  },
};

export function mergeConfig(fileConfig: PartialRecorderConfig = {}): RecorderConfig {
  return {
    ...defaultConfig,
    ...fileConfig,
    monitor: { ...defaultConfig.monitor, ...(fileConfig.monitor || {}) },
    deepgram: { ...defaultConfig.deepgram, ...(fileConfig.deepgram || {}) },
    browser: { ...defaultConfig.browser, ...(fileConfig.browser || {}) },
    mic: { ...defaultConfig.mic, ...(fileConfig.mic || {}) },
  };
}

export function loadConfig(configPath: string): RecorderConfig {
  if (!existsSync(configPath)) return mergeConfig();
  const fileConfig = JSON.parse(readFileSync(configPath, 'utf8')) as PartialRecorderConfig;
  return mergeConfig(fileConfig);
}

export function userConfigPath(): string {
  const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
  const configHome = process.env.XDG_CONFIG_HOME || resolve(home, '.config');
  return resolve(configHome, 'streamscribe', 'recorder.config.json');
}

export function resolveConfigPath(root: string, cwd = process.cwd()): string {
  if (process.env.STREAMSCRIBE_CONFIG) return resolve(process.env.STREAMSCRIBE_CONFIG);
  if (process.env.MIC_AUDIO_CAPTURE_CONFIG) return resolve(process.env.MIC_AUDIO_CAPTURE_CONFIG);
  if (process.env.AUDIO_RECORDER_CONFIG) return resolve(process.env.AUDIO_RECORDER_CONFIG);

  const cwdConfig = resolve(cwd, 'recorder.config.json');
  if (existsSync(cwdConfig)) return cwdConfig;

  const userConfig = userConfigPath();
  if (existsSync(userConfig)) return userConfig;

  const packageConfig = resolve(root, 'recorder.config.json');
  if (existsSync(packageConfig)) return packageConfig;

  return resolve(root, 'recorder.config.example.json');
}

export function initConfig(targetPath = userConfigPath(), examplePath = resolve(dirname(targetPath), 'recorder.config.example.json')): string {
  if (existsSync(targetPath)) return targetPath;
  mkdirSync(dirname(targetPath), { recursive: true });
  if (existsSync(examplePath)) copyFileSync(examplePath, targetPath);
  else writeFileSync(targetPath, `${JSON.stringify(defaultConfig, null, 2)}\n`);
  return targetPath;
}

export function timestampForDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function quoteDeviceName(device?: string): string {
  if (!device || device === 'default') return 'default';
  return String(device);
}

export function inputArgs(source: AudioSourceConfig): string[] {
  const backend = source.backend || 'dshow';
  const device = quoteDeviceName(source.device || 'default');

  if (backend === 'wasapi-loopback') return ['-f', 'wasapi', '-loopback', '1', '-i', device];
  if (backend === 'wasapi') return ['-f', 'wasapi', '-i', device];
  if (backend === 'dshow') return ['-f', 'dshow', '-i', device === 'default' ? 'audio=default' : `audio=${device}`];

  throw new Error(`Unsupported backend "${backend}". Use dshow, wasapi, or wasapi-loopback.`);
}

export function runPassthrough(command: string, args: string[]): Promise<void> {
  return new Promise(resolvePromise => {
    const p = spawn(command, args, { stdio: 'inherit', windowsHide: true });
    p.on('error', err => {
      console.error(`Failed to run ${command}: ${err.message}`);
      process.exitCode = 1;
      resolvePromise();
    });
    p.on('exit', () => resolvePromise());
  });
}

export function captureFfmpegOutput(command: string, args: string[], timeoutMs = 5000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise(resolvePromise => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const p = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, code });
    };
    const timer = setTimeout(() => {
      if (!p.killed) p.kill('SIGKILL');
      finish(null);
    }, timeoutMs);
    timer.unref?.();
    p.stdout?.on('data', chunk => { stdout += chunk.toString('utf8'); });
    p.stderr?.on('data', chunk => { stderr += chunk.toString('utf8'); });
    p.on('error', () => finish(null));
    p.on('exit', code => finish(code));
  });
}

const LOOPBACK_DEVICE_PATTERN = /(virtual-audio-capturer|CABLE Output|Stereo Mix|VoiceMeeter Out|screen-capture-recorder)/i;
const OBVIOUS_NON_MIC_PATTERN = /(output|loopback|virtual-audio-capturer|CABLE Output|Stereo Mix|VoiceMeeter Out|screen-capture-recorder)/i;
const DSHOW_DEVICE_LINE = /^\[dshow @ [^\]]+\]\s+"([^"]+)"\s+\((audio|video|none)\)\s*$/gm;
const INDEV_LINE = /^\s*D\s+(\S+)/;

export function classifyDevice(name: string): AudioDeviceKind {
  if (LOOPBACK_DEVICE_PATTERN.test(name)) return 'loopback';
  return 'mic';
}

export async function probeIndevs(ffmpegPath: string): Promise<FfmpegCapabilities> {
  const cached = (globalThis as Record<string, unknown>).__streamscribeIndevs as FfmpegCapabilities | undefined;
  if (cached) return cached;
  const { stdout, stderr } = await captureFfmpegOutput(ffmpegPath, ['-hide_banner', '-devices']);
  const text = `${stdout}\n${stderr}`;
  const indevs = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = INDEV_LINE.exec(line);
    if (m && m[1]) indevs.add(m[1]);
  }
  const caps: FfmpegCapabilities = {
    hasDshow: indevs.has('dshow'),
    hasWasapi: indevs.has('wasapi'),
  };
  (globalThis as Record<string, unknown>).__streamscribeIndevs = caps;
  return caps;
}

export function parseDshowDevices(stderr: string): DiscoveredDevice[] {
  const devices: DiscoveredDevice[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  DSHOW_DEVICE_LINE.lastIndex = 0;
  while ((match = DSHOW_DEVICE_LINE.exec(stderr)) !== null) {
    const [, name, kind] = match;
    if (!name || kind !== 'audio') continue;
    if (seen.has(name)) continue;
    seen.add(name);
    devices.push({ name, kind: classifyDevice(name), source: 'dshow' });
  }
  return devices;
}

export async function enumerateAudioSources(ffmpegPath: string): Promise<DiscoveredDevice[]> {
  const caps = await probeIndevs(ffmpegPath);
  const devices: DiscoveredDevice[] = [];
  if (caps.hasDshow) {
    const { stderr } = await captureFfmpegOutput(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
    devices.push(...parseDshowDevices(stderr));
  }
  return devices;
}

export function filterPlaybackSources(devices: DiscoveredDevice[]): DiscoveredDevice[] {
  return devices.filter(d => d.kind === 'loopback');
}

export function filterMicSources(devices: DiscoveredDevice[]): DiscoveredDevice[] {
  return devices.filter(d => d.kind === 'mic' && !OBVIOUS_NON_MIC_PATTERN.test(d.name));
}

export function monitorShouldRun(config: RecorderConfig): boolean {
  const enabled = config.monitor?.enabled;
  if (enabled === false) return false;
  if (enabled === true) return true;
  const backend = config.browser?.backend;
  if (backend === 'wasapi-loopback') return false;
  const device = config.browser?.device || '';
  if (/virtual-audio-capturer|Stereo Mix|VoiceMeeter Out|screen-capture-recorder/i.test(device)) return false;
  if (/CABLE Output/i.test(device)) return true;
  return true;
}

export function isConfigUsable(config: RecorderConfig, devices: DiscoveredDevice[]): boolean {
  const browserDevice = (config.browser?.device || '').trim();
  const micDevice = (config.mic?.device || '').trim();
  if (!browserDevice || !micDevice) return false;
  const names = new Set(devices.map(d => d.name.toLowerCase()));
  if (!names.has(browserDevice.toLowerCase())) return false;
  if (!names.has(micDevice.toLowerCase())) return false;
  return true;
}

export function printNoLoopbackGuidance(): void {
  console.error('');
  console.error('No system-audio capture driver detected on this machine.');
  console.error('');
  console.error('To capture playback audio (any app), install ONE of:');
  console.error('');
  console.error('  Recommended: screen-capture-recorder');
  console.error('    https://github.com/rdp/screen-capture-recorder-to-video-windows-free');
  console.error('    Adds a "virtual-audio-capturer" DirectShow device. You keep hearing audio normally.');
  console.error('');
  console.error('  Alternative: VB-CABLE');
  console.error('    https://vb-audio.com/Cable/');
  console.error('    Routes selected apps to a virtual sink. Requires per-app Windows routing.');
  console.error('');
  console.error('After installing (and rebooting if prompted), re-run streamscribe.');
}

function shouldBackupExistingConfig(targetPath: string, examplePath: string): boolean {
  if (!existsSync(targetPath)) return false;
  if (!existsSync(examplePath)) return true;
  try {
    const existing = readFileSync(targetPath, 'utf8');
    const example = readFileSync(examplePath, 'utf8');
    return existing.trim() !== example.trim();
  } catch {
    return true;
  }
}

function writePickedConfig(targetPath: string, examplePath: string, current: RecorderConfig, playback: DiscoveredDevice, mic: DiscoveredDevice): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  if (shouldBackupExistingConfig(targetPath, examplePath)) {
    const backupPath = `${targetPath}.bak.${timestampForDate()}`;
    try { copyFileSync(targetPath, backupPath); console.log(`Backed up existing config to: ${backupPath}`); } catch {}
  }
  const next: RecorderConfig = {
    ...current,
    monitor: { ...current.monitor, enabled: 'auto' },
    browser: { ...current.browser, backend: 'dshow', device: playback.name },
    mic: { ...current.mic, backend: 'dshow', device: mic.name },
  };
  writeFileSync(targetPath, `${JSON.stringify(next, null, 2)}\n`);
}

export interface ResolveZeroConfigOptions {
  config: RecorderConfig;
  configPath: string;
  root: string;
  force?: boolean;
}

export interface ResolvedConfig {
  config: RecorderConfig;
  configPath: string;
}

export async function resolveZeroConfig({ config, configPath, root, force }: ResolveZeroConfigOptions): Promise<ResolvedConfig> {
  const ffmpegPath = config.ffmpegPath || 'ffmpeg';
  const examplePath = resolve(root, 'recorder.config.example.json');
  let devices: DiscoveredDevice[] = [];
  try {
    devices = await enumerateAudioSources(ffmpegPath);
  } catch (err) {
    console.error(`Could not enumerate audio devices via FFmpeg: ${(err as Error).message}`);
    console.error('Make sure FFmpeg is installed and on PATH, then re-run.');
    process.exit(1);
  }

  if (!force && isConfigUsable(config, devices)) return { config, configPath };

  const playback = filterPlaybackSources(devices);
  const mics = filterMicSources(devices);

  if (playback.length === 0) {
    printNoLoopbackGuidance();
    process.exit(1);
  }
  if (mics.length === 0) {
    console.error('No microphones detected. Connect a microphone and re-run.');
    process.exit(1);
  }

  if (!process.stdin.isTTY) {
    console.error('Audio sources are not configured and this is not an interactive terminal.');
    console.error('Run `streamscribe pick` from a terminal to configure, or edit:');
    console.error(`  ${userConfigPath()}`);
    process.exit(1);
  }

  const result = await runPicker({ playback, mics });
  if (!result.ok) {
    if (result.reason === 'cancelled') {
      console.error('Setup cancelled.');
      process.exit(1);
    }
    if (result.reason === 'no-playback') {
      printNoLoopbackGuidance();
      process.exit(1);
    }
    if (result.reason === 'no-mic') {
      console.error('No microphones detected. Connect a microphone and re-run.');
      process.exit(1);
    }
    if (result.reason === 'no-tty') {
      console.error('Picker requires an interactive terminal.');
      process.exit(1);
    }
    process.exit(1);
  }

  const writingToExample = resolve(configPath) === resolve(examplePath);
  const targetPath = writingToExample ? userConfigPath() : configPath;
  writePickedConfig(targetPath, examplePath, config, result.playback, result.mic);
  console.log(`\nSaved to: ${targetPath}`);
  const reloaded = loadConfig(targetPath);
  return { config: reloaded, configPath: targetPath };
}

export async function listDevices(ffmpegPath: string): Promise<void> {
  const caps = await probeIndevs(ffmpegPath);
  console.log('Listing DirectShow audio devices...');
  await runPassthrough(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
  if (caps.hasWasapi) {
    console.log('\nListing WASAPI devices...');
    await runPassthrough(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'wasapi', '-i', 'dummy']);
  } else {
    console.log('\nWASAPI: not supported by this FFmpeg build (skipping).');
  }
}

export function buildMonitorArgs(config: RecorderConfig): string[] {
  const browser = config.browser || {};
  const monitor = config.monitor || defaultConfig.monitor;
  const args = [
    '-hide_banner',
    '-nodisp',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-f', 'dshow',
    '-i', `audio=${browser.device || 'default'}`,
  ];

  if (monitor.volume && Number(monitor.volume) !== 100) args.push('-af', `volume=${Number(monitor.volume) / 100}`);
  return args;
}

export function buildFfmpegArgs(config: RecorderConfig, outputFile: string): string[] {
  const sampleRate = Number(config.sampleRate || 48000);
  return [
    '-hide_banner',
    '-y',
    ...inputArgs(config.browser || {}),
    ...inputArgs(config.mic || {}),
    '-filter_complex',
    `[0:a]aresample=${sampleRate},aformat=sample_fmts=s16:channel_layouts=mono[browser];` +
      `[1:a]aresample=${sampleRate},aformat=sample_fmts=s16:channel_layouts=mono[mic];` +
      `[browser][mic]amerge=inputs=2,pan=stereo|c0=c0|c1=c1[out]`,
    '-map', '[out]',
    '-ar', String(sampleRate),
    '-ac', '2',
    '-c:a', 'pcm_s16le',
    outputFile,
  ];
}

export function buildLiveCaptureArgs(config: RecorderConfig, source: AudioSourceConfig): string[] {
  const sampleRate = Number(config.deepgram?.sttSampleRate || 16000);
  return [
    '-hide_banner',
    '-loglevel', 'error',
    ...inputArgs(source),
    '-vn',
    '-ac', '1',
    '-ar', String(sampleRate),
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    'pipe:1',
  ];
}

export function record(config: RecorderConfig, paths: RuntimePaths): void {
  const outputDir = resolve(paths.root, config.outputDir || 'recordings');
  mkdirSync(outputDir, { recursive: true });
  const outputFile = resolve(outputDir, `recording-${timestampForDate()}.wav`);
  const args = buildFfmpegArgs(config, outputFile);

  const runMonitor = monitorShouldRun(config);
  console.log('Starting recording.');
  console.log(`Playback source -> left channel (${config.browser?.backend || 'dshow'}:${config.browser?.device || 'default'})`);
  console.log(`Microphone      -> right channel (${config.mic?.backend || 'dshow'}:${config.mic?.device || 'default'})`);
  console.log(`Output file     -> ${outputFile}`);
  console.log(runMonitor ? `Live monitor    -> enabled via ${config.monitor?.ffplayPath || 'ffplay'} (playback only)` : 'Live monitor    -> off (you hear audio natively)');
  console.log('Press Ctrl+C, q, or Enter to stop and save.\n');

  let monitor: ChildProcess | null = null;
  if (runMonitor) {
    monitor = spawn(config.monitor?.ffplayPath || 'ffplay', buildMonitorArgs(config), { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    monitor.on('error', err => {
      console.error(`Live monitor failed to start: ${err.message}`);
      console.error('Recording will continue, but you may not hear playback audio live. Make sure ffplay is available on PATH.');
    });
  }

  const ffmpeg = spawn(config.ffmpegPath || 'ffmpeg', args, { stdio: ['pipe', 'inherit', 'pipe'], windowsHide: true });
  let ffmpegStderr = '';
  ffmpeg.stderr?.on('data', chunk => {
    const text = chunk.toString('utf8');
    ffmpegStderr += text;
    process.stderr.write(text);
  });

  let stopping = false;
  let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
  const stdin = process.stdin as typeof process.stdin & { setRawMode?: (mode: boolean) => void };

  const cleanupAndExit = (code: number) => {
    if (forceKillTimer) clearTimeout(forceKillTimer);
    if (monitor && !monitor.killed) monitor.kill('SIGTERM');
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (stdin.isTTY) {
      stdin.off('data', onStdinData);
      try { stdin.setRawMode?.(false); } catch {}
      stdin.pause();
    }
    process.exitCode = code;
    setImmediate(() => process.exit(code));
  };

  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log('\nStopping recording and finalizing WAV...');
    try { ffmpeg.stdin?.write('q'); } catch {}
    forceKillTimer = setTimeout(() => {
      if (!ffmpeg.killed) ffmpeg.kill('SIGINT');
    }, 5000);
    forceKillTimer.unref?.();
  };

  const onStdinData = (chunk: Buffer) => {
    const s = chunk.toString('utf8');
    if (s === '\u0003' || s === 'q' || s === '\r' || s === '\n') stop();
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (stdin.isTTY) {
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onStdinData);
  }

  ffmpeg.on('error', err => {
    if (monitor && !monitor.killed) monitor.kill('SIGTERM');
    console.error(`Failed to start FFmpeg: ${err.message}`);
    console.error('Install FFmpeg and make sure it is available on PATH, or set ffmpegPath in recorder.config.json.');
    cleanupAndExit(1);
  });

  ffmpeg.on('exit', code => {
    if (code === 0) {
      console.log(`\nSaved recording: ${outputFile}`);
      cleanupAndExit(0);
    } else {
      console.error(`\nFFmpeg exited with code ${code}. The output may be missing or incomplete: ${outputFile}`);
      if (/Could not find audio only device with name/.test(ffmpegStderr) || /Error opening input file audio=/.test(ffmpegStderr)) {
        console.error('\nA configured audio device was not found. The device may have been unplugged or renamed.');
        console.error('Re-run with `--pick` to reselect your sources:');
        console.error('  streamscribe record --pick');
        console.error('Or `streamscribe pick` to update your saved config.');
      }
      cleanupAndExit(code || 1);
    }
  });
}

export function deepgramListenUrl(deepgramConfig: DeepgramConfig): string {
  const params = new URLSearchParams({
    model: deepgramConfig.sttModel || 'nova-3',
    encoding: 'linear16',
    sample_rate: String(Number(deepgramConfig.sttSampleRate || 16000)),
    channels: '1',
    interim_results: String(Boolean(deepgramConfig.interimResults)),
    punctuate: String(deepgramConfig.punctuate !== false),
    smart_format: String(deepgramConfig.smartFormat !== false),
    endpointing: String(Number(deepgramConfig.endpointing || 300)),
  });
  if (deepgramConfig.language) params.set('language', deepgramConfig.language);
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export class DeepgramSpeechQueue {
  private queue: Array<{ text: string; model: string }> = [];
  private playing = false;
  private closed = false;
  private children = new Set<ChildProcess>();

  constructor(private config: DeepgramConfig, private apiKey: string) {}

  enqueue(text: string, source: AudioSourceConfig): void {
    const clean = String(text || '').trim();
    if (!clean || this.closed) return;
    const speakChannelNames = this.config.speakChannelNames !== false;
    const spokenText = speakChannelNames ? `${source.ttsName || source.label || 'channel'}: ${clean}` : clean;
    this.queue.push({ text: spokenText, model: source.ttsModel || this.config.ttsModel || 'aura-2-thalia-en' });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length && !this.closed) {
        const item = this.queue.shift();
        if (!item) continue;
        try {
          const audio = await this.synthesize(item.text, item.model);
          await this.play(audio);
        } catch (err) {
          if (this.config.debug) console.error(`Deepgram TTS failed: ${(err as Error).message}`);
        }
      }
    } finally {
      this.playing = false;
    }
  }

  private async synthesize(text: string, model: string): Promise<Buffer> {
    const sampleRate = Number(this.config.ttsSampleRate || 24000);
    const encoding = this.config.ttsEncoding || 'linear16';
    const params = new URLSearchParams({ model, encoding, container: this.config.ttsContainer || 'wav', sample_rate: String(sampleRate) });
    const res = await fetch(`https://api.deepgram.com/v1/speak?${params.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private play(audio: Buffer): Promise<void> {
    return new Promise(resolvePromise => {
      const ffplay = spawn(this.config.ffplayPath || 'ffplay', ['-hide_banner', '-loglevel', 'quiet', '-nodisp', '-autoexit', '-i', 'pipe:0'], {
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
      });
      this.children.add(ffplay);
      ffplay.on('error', () => resolvePromise());
      ffplay.on('exit', () => {
        this.children.delete(ffplay);
        resolvePromise();
      });
      ffplay.stdin?.on('error', () => {});
      ffplay.stdin?.end(audio);
    });
  }

  close(): void {
    this.closed = true;
    this.queue.length = 0;
    for (const child of this.children) if (!child.killed) child.kill('SIGTERM');
  }
}

type EventWaitTarget = {
  once?: (eventName: string, cb: () => void) => unknown;
  addEventListener?: (eventName: string, cb: () => void, options?: { once?: boolean }) => unknown;
};

export function waitForEventOrTimeout(target: EventWaitTarget, eventName: string, timeoutMs = 1500): Promise<void> {
  return new Promise(resolvePromise => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise();
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    if (target.once) target.once(eventName, finish);
    else target.addEventListener?.(eventName, finish, { once: true });
  });
}

export interface DeepgramChannel {
  stop(): Promise<void>;
}

export interface TranscriptEvent {
  text: string;
  source: AudioSourceConfig;
  isFinal: boolean;
  speechFinal: boolean;
}

export function startDeepgramChannel({ config, source, apiKey, onTranscript }: {
  config: RecorderConfig;
  source: AudioSourceConfig;
  apiKey: string;
  onTranscript?: (event: TranscriptEvent) => void;
}): DeepgramChannel {
  const deepgramConfig = config.deepgram || defaultConfig.deepgram;
  const ws = new WebSocket(deepgramListenUrl(deepgramConfig), ['token', apiKey]);
  const ffmpeg = spawn(config.ffmpegPath || 'ffmpeg', buildLiveCaptureArgs(config, source), {
    stdio: ['ignore', 'pipe', deepgramConfig.debug ? 'inherit' : 'ignore'],
    windowsHide: true,
  });

  const pendingChunks: Buffer[] = [];
  let socketOpen = false;

  ws.addEventListener('open', () => {
    socketOpen = true;
    while (pendingChunks.length && ws.readyState === WebSocket.OPEN) ws.send(pendingChunks.shift()!);
  });

  ws.addEventListener('message', event => {
    try {
      const data = typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString('utf8');
      const msg = JSON.parse(data) as { channel?: { alternatives?: Array<{ transcript?: string }> }; is_final?: boolean; speech_final?: boolean };
      const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim();
      if (transcript && (msg.is_final || msg.speech_final || deepgramConfig.printInterim)) {
        onTranscript?.({ text: transcript, source, isFinal: Boolean(msg.is_final || msg.speech_final), speechFinal: Boolean(msg.speech_final) });
      }
    } catch (err) {
      if (deepgramConfig.debug) console.error(`Deepgram parse failed: ${(err as Error).message}`);
    }
  });

  ws.addEventListener('error', () => {
    if (deepgramConfig.debug) console.error(`Deepgram STT socket error (${source.ttsName || source.label})`);
  });

  ffmpeg.stdout?.on('data', chunk => {
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    else if (!socketOpen) pendingChunks.push(chunk);
  });

  ffmpeg.on('error', err => {
    if (deepgramConfig.debug) console.error(`FFmpeg failed (${source.ttsName || source.label}): ${err.message}`);
  });

  ffmpeg.on('exit', () => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
      setTimeout(() => { try { ws.close(); } catch {} }, 250).unref?.();
    }
  });

  return {
    async stop() {
      pendingChunks.length = 0;
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
        try { ws.close(1000, 'client shutdown'); } catch {}
      } else if (ws.readyState === WebSocket.CONNECTING) {
        try { ws.close(); } catch {}
      }

      if (!ffmpeg.killed) ffmpeg.kill('SIGTERM');
      await Promise.allSettled([waitForEventOrTimeout(ffmpeg, 'exit', 2000), waitForEventOrTimeout(ws, 'close', 2000)]);
      if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) try { ws.close(); } catch {}
    },
  };
}

export function startLiveMonitor(config: RecorderConfig): ChildProcess | null {
  if (!monitorShouldRun(config)) return null;
  const monitor = spawn(config.monitor?.ffplayPath || 'ffplay', buildMonitorArgs(config), {
    stdio: ['ignore', 'ignore', config.deepgram?.debug ? 'inherit' : 'ignore'],
    windowsHide: true,
  });
  monitor.on('error', err => {
    if (config.deepgram?.debug) console.error(`Live original-audio monitor failed: ${err.message}`);
  });
  return monitor;
}

export async function stopLiveMonitor(monitor: ChildProcess | null): Promise<void> {
  if (!monitor || monitor.killed) return;
  monitor.kill('SIGTERM');
  await waitForEventOrTimeout(monitor, 'exit', 1500);
  if (!monitor.killed) monitor.kill('SIGKILL');
}

export function createTranscriptPrinter(): (event: Omit<TranscriptEvent, 'speechFinal'>) => void {
  let lastInterimLength = 0;
  const startedAt = Date.now();
  const elapsed = () => {
    const total = Math.floor((Date.now() - startedAt) / 1000);
    const minutes = String(Math.floor(total / 60)).padStart(2, '0');
    const seconds = String(total % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };
  const clearInterim = () => {
    if (lastInterimLength > 0) {
      process.stdout.write(`\r${' '.repeat(lastInterimLength)}\r`);
      lastInterimLength = 0;
    }
  };

  return ({ text, source, isFinal }) => {
    const channel = source.ttsName || source.label || 'channel';
    const line = `[${elapsed()}] [${channel}] ${text}`;
    if (isFinal) {
      clearInterim();
      console.log(line);
    } else {
      const interim = `${line} ...`;
      process.stdout.write(`\r${interim}`);
      lastInterimLength = interim.length;
    }
  };
}

export function liveTranscribeAndSpeak(config: RecorderConfig): void {
  const deepgramConfig = config.deepgram || defaultConfig.deepgram;
  const apiKeyName = deepgramConfig.apiKeyEnv || 'DEEPGRAM_API_KEY';
  const apiKey = process.env[apiKeyName] || deepgramConfig.apiKey;
  if (!apiKey) {
    console.error(`Missing Deepgram API key. Set ${apiKeyName} before running live mode.`);
    process.exit(1);
  }

  const onTranscript = createTranscriptPrinter();
  const monitor = startLiveMonitor(config);
  const channels = [
    startDeepgramChannel({ config, source: config.browser || {}, apiKey, onTranscript }),
    startDeepgramChannel({ config, source: config.mic || {}, apiKey, onTranscript }),
  ];

  console.log('Live transcription started. Transcripts will print below.');
  if (monitor) console.log('Live monitor is on: playing your loopback source through the Windows default output so you can hear it.');
  else console.log('Live monitor is off: you already hear audio natively (parallel-tap loopback).');
  console.log('Press q, Enter, or Ctrl+C to stop.\n');

  let stopping = false;
  const stdin = process.stdin as typeof process.stdin & { setRawMode?: (mode: boolean) => void };
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (stdin.isTTY) {
      stdin.off('data', onStdinData);
      try { stdin.setRawMode?.(false); } catch {}
      stdin.pause();
    }

    await Promise.allSettled([...channels.map(channel => channel.stop()), stopLiveMonitor(monitor)]);
    process.exit(0);
  };

  const onStdinData = (chunk: Buffer) => {
    const s = chunk.toString('utf8');
    if (s === '\u0003' || s === 'q' || s === '\r' || s === '\n') void stop();
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (stdin.isTTY) {
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onStdinData);
  }
}

export function readPackageVersion(root: string): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function help(configPath: string, config: RecorderConfig): string {
  return `Usage:
  streamscribe live                  Start live Deepgram STT (picks sources on first run)
  streamscribe live --pick           Re-pick sources, then go live
  streamscribe record                Save a stereo WAV recording
  streamscribe record --pick         Re-pick sources, then record
  streamscribe pick                  Interactive picker — pick playback + mic sources
  streamscribe devices               List available audio devices (raw FFmpeg dump)
  streamscribe init-config           Create a user config file
  streamscribe --version             Print the installed StreamScribe version
  mic-audio-capture live             Backward-compatible alias
  chrome-mic-stt live                Alias installed by the package

Development:
  bun start                          Start live mode from a clone
  bun run record                     Save a recording from a clone
  bun run devices                    List FFmpeg devices from a clone

Config: ${configPath}
Deepgram API key: set ${config.deepgram?.apiKeyEnv || 'DEEPGRAM_API_KEY'}
`;
}
