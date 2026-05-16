#!/usr/bin/env bun
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { help, listDevices, liveTranscribeAndSpeak, loadConfig, record } from './lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const configPath = resolve(root, 'recorder.config.json');
const config = loadConfig(configPath);
const command = process.argv[2] || 'live';

if (command === 'live' || command === 'start') liveTranscribeAndSpeak(config);
else if (command === 'record') record(config, { root, configPath });
else if (command === 'devices') await listDevices(config.ffmpegPath || 'ffmpeg');
else if (command === 'help' || command === '--help' || command === '-h') console.log(help(configPath, config));
else {
  console.error(`Unknown command: ${command}\n`);
  console.log(help(configPath, config));
  process.exit(1);
}
