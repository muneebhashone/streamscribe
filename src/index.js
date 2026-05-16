#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
loadDotEnv({ path: resolve(root, '.env'), quiet: true });
const configPath = resolve(root, 'recorder.config.json');

function loadConfig() {
  const fallback = {
    ffmpegPath: 'ffmpeg',
    outputDir: 'recordings',
    sampleRate: 48000,
    monitor: { enabled: true, ffplayPath: 'ffplay', volume: 100 },
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
      debug: false
    },
    browser: { label: 'Chrome / system audio', backend: 'dshow', device: 'CABLE Output (VB-Audio Virtual Cable)', channel: 'left', ttsName: 'browser' },
    mic: { label: 'System microphone', backend: 'dshow', device: 'default', channel: 'right', ttsName: 'microphone' }
  };
  if (!existsSync(configPath)) return fallback;
  const fileConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  return {
    ...fallback,
    ...fileConfig,
    monitor: { ...fallback.monitor, ...(fileConfig.monitor || {}) },
    deepgram: { ...fallback.deepgram, ...(fileConfig.deepgram || {}) },
    browser: { ...fallback.browser, ...(fileConfig.browser || {}) },
    mic: { ...fallback.mic, ...(fileConfig.mic || {}) }
  };
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function quoteDeviceName(device) {
  if (!device || device === 'default') return 'default';
  return String(device);
}

function inputArgs(source) {
  const backend = source.backend || 'dshow';
  const device = quoteDeviceName(source.device || 'default');

  if (backend === 'wasapi-loopback') {
    return ['-f', 'wasapi', '-loopback', '1', '-i', device];
  }

  if (backend === 'wasapi') {
    return ['-f', 'wasapi', '-i', device];
  }

  if (backend === 'dshow') {
    return ['-f', 'dshow', '-i', device === 'default' ? 'audio=default' : `audio=${device}`];
  }

  throw new Error(`Unsupported backend "${backend}". Use dshow, wasapi, or wasapi-loopback.`);
}

async function listDevices(ffmpegPath) {
  console.log('Listing DirectShow audio devices...');
  await runPassthrough(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
  console.log('\nListing WASAPI devices, if this FFmpeg build supports them...');
  await runPassthrough(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'wasapi', '-i', 'dummy']);
}

function runPassthrough(command, args) {
  return new Promise(resolve => {
    const p = spawn(command, args, { stdio: 'inherit', windowsHide: true });
    p.on('error', err => {
      console.error(`Failed to run ${command}: ${err.message}`);
      process.exitCode = 1;
      resolve();
    });
    p.on('exit', () => resolve());
  });
}

function buildMonitorArgs(config) {
  const browser = config.browser || {};
  const monitor = config.monitor || {};
  const args = [
    '-hide_banner',
    '-nodisp',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-f', 'dshow',
    '-i', `audio=${browser.device || 'default'}`
  ];

  if (monitor.volume && Number(monitor.volume) !== 100) {
    args.push('-af', `volume=${Number(monitor.volume) / 100}`);
  }

  return args;
}

function buildFfmpegArgs(config, outputFile) {
  const sampleRate = Number(config.sampleRate || 48000);
  const browserArgs = inputArgs(config.browser || {});
  const micArgs = inputArgs(config.mic || {});

  return [
    '-hide_banner',
    '-y',
    ...browserArgs,
    ...micArgs,
    '-filter_complex',
    `[0:a]aresample=${sampleRate},aformat=sample_fmts=s16:channel_layouts=mono[browser];` +
      `[1:a]aresample=${sampleRate},aformat=sample_fmts=s16:channel_layouts=mono[mic];` +
      `[browser][mic]amerge=inputs=2,pan=stereo|c0=c0|c1=c1[out]`,
    '-map', '[out]',
    '-ar', String(sampleRate),
    '-ac', '2',
    '-c:a', 'pcm_s16le',
    outputFile
  ];
}

function record(config) {
  const outputDir = resolve(root, config.outputDir || 'recordings');
  mkdirSync(outputDir, { recursive: true });
  const outputFile = resolve(outputDir, `recording-${timestamp()}.wav`);
  const args = buildFfmpegArgs(config, outputFile);

  console.log('Starting recording.');
  console.log(`Chrome/system playback -> left channel (${config.browser?.backend || 'dshow'}:${config.browser?.device || 'default'})`);
  console.log(`System microphone   -> right channel (${config.mic?.backend || 'dshow'}:${config.mic?.device || 'default'})`);
  console.log(`Output file         -> ${outputFile}`);
  if (config.monitor?.enabled !== false) {
    console.log(`Live monitor       -> enabled via ${config.monitor?.ffplayPath || 'ffplay'} (Chrome/system audio only)`);
  } else {
    console.log('Live monitor       -> disabled');
  }
  console.log('Press Ctrl+C, q, or Enter to stop and save.\n');

  let monitor = null;
  if (config.monitor?.enabled !== false) {
    monitor = spawn(config.monitor?.ffplayPath || 'ffplay', buildMonitorArgs(config), {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });
    monitor.on('error', err => {
      console.error(`Live monitor failed to start: ${err.message}`);
      console.error('Recording will continue, but you may not hear Chrome audio live. Make sure ffplay is available on PATH.');
    });
  }

  const ffmpeg = spawn(config.ffmpegPath || 'ffmpeg', args, {
    stdio: ['pipe', 'inherit', 'pipe'],
    windowsHide: true
  });

  let ffmpegStderr = '';
  ffmpeg.stderr.on('data', chunk => {
    const text = chunk.toString('utf8');
    ffmpegStderr += text;
    process.stderr.write(text);
  });

  let stopping = false;
  let forceKillTimer = null;
  const cleanupAndExit = code => {
    if (forceKillTimer) clearTimeout(forceKillTimer);
    if (monitor && !monitor.killed) monitor.kill('SIGTERM');
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (process.stdin.isTTY) {
      process.stdin.off('data', onStdinData);
      try { process.stdin.setRawMode(false); } catch {}
      process.stdin.pause();
    }
    process.exitCode = code;
    setImmediate(() => process.exit(code));
  };

  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log('\nStopping recording and finalizing WAV...');
    try { ffmpeg.stdin.write('q'); } catch {}
    forceKillTimer = setTimeout(() => {
      if (!ffmpeg.killed) ffmpeg.kill('SIGINT');
    }, 5000);
    forceKillTimer.unref();
  };

  const onStdinData = chunk => {
    const s = chunk.toString('utf8');
    if (s === '\u0003' || s === 'q' || s === '\r' || s === '\n') stop();
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onStdinData);
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
        console.error('\nDevice not found. Run `npm run devices` and set recorder.config.json to an audio device that actually appears there.');
        console.error('For Chrome/system playback audio, Windows must expose a loopback/recording device such as Stereo Mix, VB-CABLE CABLE Output, or screen-capture-recorder virtual-audio-capturer.');
        console.error('Your system microphone should stay as a separate dshow mic device.');
      }
      cleanupAndExit(code || 1);
    }
  });
}

function deepgramListenUrl(deepgramConfig) {
  const params = new URLSearchParams({
    model: deepgramConfig.sttModel || 'nova-3',
    encoding: 'linear16',
    sample_rate: String(Number(deepgramConfig.sttSampleRate || 16000)),
    channels: '1',
    interim_results: String(Boolean(deepgramConfig.interimResults)),
    punctuate: String(deepgramConfig.punctuate !== false),
    smart_format: String(deepgramConfig.smartFormat !== false),
    endpointing: String(Number(deepgramConfig.endpointing || 300))
  });
  if (deepgramConfig.language) params.set('language', deepgramConfig.language);
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

function buildLiveCaptureArgs(config, source) {
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
    'pipe:1'
  ];
}

class DeepgramSpeechQueue {
  constructor(deepgramConfig, apiKey) {
    this.config = deepgramConfig;
    this.apiKey = apiKey;
    this.queue = [];
    this.playing = false;
    this.closed = false;
    this.children = new Set();
  }

  enqueue(text, source) {
    const clean = String(text || '').trim();
    if (!clean || this.closed) return;
    const speakChannelNames = this.config.speakChannelNames !== false;
    const spokenText = speakChannelNames ? `${source.ttsName || source.label || 'channel'}: ${clean}` : clean;
    this.queue.push({ text: spokenText, model: source.ttsModel || this.config.ttsModel || 'aura-2-thalia-en' });
    void this.drain();
  }

  async drain() {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length && !this.closed) {
        const item = this.queue.shift();
        try {
          const audio = await this.synthesize(item.text, item.model);
          await this.play(audio);
        } catch (err) {
          if (this.config.debug) console.error(`Deepgram TTS failed: ${err.message}`);
        }
      }
    } finally {
      this.playing = false;
    }
  }

  async synthesize(text, model) {
    const sampleRate = Number(this.config.ttsSampleRate || 24000);
    const encoding = this.config.ttsEncoding || 'linear16';
    const params = new URLSearchParams({
      model,
      encoding,
      container: this.config.ttsContainer || 'wav',
      sample_rate: String(sampleRate)
    });
    const res = await fetch(`https://api.deepgram.com/v1/speak?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  play(audio) {
    return new Promise(resolve => {
      const ffplay = spawn(this.config.ffplayPath || 'ffplay', [
        '-hide_banner',
        '-loglevel', 'quiet',
        '-nodisp',
        '-autoexit',
        '-i', 'pipe:0'
      ], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
      this.children.add(ffplay);
      ffplay.on('error', () => resolve());
      ffplay.on('exit', () => {
        this.children.delete(ffplay);
        resolve();
      });
      ffplay.stdin.on('error', () => {});
      ffplay.stdin.end(audio);
    });
  }

  close() {
    this.closed = true;
    this.queue.length = 0;
    for (const child of this.children) {
      if (!child.killed) child.kill('SIGTERM');
    }
  }
}

function waitForEventOrTimeout(target, eventName, timeoutMs = 1500) {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    target.once?.(eventName, finish);
  });
}

function startDeepgramChannel({ config, source, apiKey, onTranscript }) {
  const deepgramConfig = config.deepgram || {};
  const ws = new WebSocket(deepgramListenUrl(deepgramConfig), ['token', apiKey]);
  const ffmpeg = spawn(config.ffmpegPath || 'ffmpeg', buildLiveCaptureArgs(config, source), {
    stdio: ['ignore', 'pipe', deepgramConfig.debug ? 'inherit' : 'ignore'],
    windowsHide: true
  });

  const pendingChunks = [];
  let socketOpen = false;

  ws.on('open', () => {
    socketOpen = true;
    while (pendingChunks.length && ws.readyState === WebSocket.OPEN) ws.send(pendingChunks.shift());
  });

  ws.on('message', data => {
    try {
      const msg = JSON.parse(data.toString('utf8'));
      const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim();
      if (transcript && (msg.is_final || msg.speech_final || deepgramConfig.printInterim)) {
        onTranscript?.({
          text: transcript,
          source,
          isFinal: Boolean(msg.is_final || msg.speech_final),
          speechFinal: Boolean(msg.speech_final)
        });
      }
    } catch (err) {
      if (deepgramConfig.debug) console.error(`Deepgram parse failed: ${err.message}`);
    }
  });

  ws.on('error', err => {
    if (deepgramConfig.debug) console.error(`Deepgram STT socket error (${source.ttsName || source.label}): ${err.message}`);
  });

  ffmpeg.stdout.on('data', chunk => {
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    else if (!socketOpen) pendingChunks.push(chunk);
  });

  ffmpeg.on('error', err => {
    if (deepgramConfig.debug) console.error(`FFmpeg failed (${source.ttsName || source.label}): ${err.message}`);
  });

  ffmpeg.on('exit', () => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
      setTimeout(() => { try { ws.close(); } catch {} }, 250).unref();
    }
  });

  return {
    async stop() {
      pendingChunks.length = 0;

      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
        try { ws.close(1000, 'client shutdown'); } catch {}
      } else if (ws.readyState === WebSocket.CONNECTING) {
        try { ws.terminate(); } catch {}
      }

      if (!ffmpeg.killed) ffmpeg.kill('SIGTERM');

      await Promise.allSettled([
        waitForEventOrTimeout(ffmpeg, 'exit', 2000),
        waitForEventOrTimeout(ws, 'close', 2000)
      ]);

      if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try { ws.terminate(); } catch {}
      }
    }
  };
}

function startLiveMonitor(config) {
  if (config.monitor?.enabled === false) return null;
  const monitor = spawn(config.monitor?.ffplayPath || 'ffplay', buildMonitorArgs(config), {
    stdio: ['ignore', 'ignore', config.deepgram?.debug ? 'inherit' : 'ignore'],
    windowsHide: true
  });
  monitor.on('error', err => {
    if (config.deepgram?.debug) console.error(`Live original-audio monitor failed: ${err.message}`);
  });
  return monitor;
}

async function stopLiveMonitor(monitor) {
  if (!monitor || monitor.killed) return;
  monitor.kill('SIGTERM');
  await waitForEventOrTimeout(monitor, 'exit', 1500);
  if (!monitor.killed) monitor.kill('SIGKILL');
}

function createTranscriptPrinter() {
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

function liveTranscribeAndSpeak(config) {
  const deepgramConfig = config.deepgram || {};
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
    startDeepgramChannel({ config, source: config.mic || {}, apiKey, onTranscript })
  ];

  console.log('Live transcription started. Deepgram TTS is disabled; only text is printed here.');
  if (monitor) console.log('Original browser/system audio monitor is enabled. It plays the CABLE Output source to the Windows default playback device.');
  console.log('Press q, Enter, or Ctrl+C to stop.\n');

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (process.stdin.isTTY) {
      process.stdin.off('data', onStdinData);
      try { process.stdin.setRawMode(false); } catch {}
      process.stdin.pause();
    }

    await Promise.allSettled([
      ...channels.map(channel => channel.stop()),
      stopLiveMonitor(monitor)
    ]);

    process.exit(0);
  };

  const onStdinData = chunk => {
    const s = chunk.toString('utf8');
    if (s === '\u0003' || s === 'q' || s === '\r' || s === '\n') stop();
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onStdinData);
  }
}

function help() {
  console.log(`Usage:
  npm start                 Start live Deepgram STT text output for both channels, no recording/TTS
  npm run live              Start live Deepgram STT text output for both channels, no recording/TTS
  npm run record            Save a stereo WAV recording
  npm run devices           List available audio devices
  node src/index.js live    Start live Deepgram STT text output
  node src/index.js record  Save a stereo WAV recording
  node src/index.js devices List FFmpeg devices

Config: ${configPath}
Deepgram API key: set ${loadConfig().deepgram?.apiKeyEnv || 'DEEPGRAM_API_KEY'}
`);
}

const config = loadConfig();
const command = process.argv[2] || 'live';

if (command === 'live' || command === 'start') liveTranscribeAndSpeak(config);
else if (command === 'record') record(config);
else if (command === 'devices') await listDevices(config.ffmpegPath || 'ffmpeg');
else if (command === 'help' || command === '--help' || command === '-h') help();
else {
  console.error(`Unknown command: ${command}\n`);
  help();
  process.exit(1);
}
