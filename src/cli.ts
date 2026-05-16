#!/usr/bin/env bun
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { help, initConfig, listDevices, liveTranscribeAndSpeak, loadConfig, record, resolveConfigPath, userConfigPath } from './lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const command = process.argv[2] || 'live';
const configPath = resolveConfigPath(root);
const config = loadConfig(configPath);

if (command === 'live' || command === 'start') liveTranscribeAndSpeak(config);
else if (command === 'record') record(config, { root, configPath });
else if (command === 'devices') await listDevices(config.ffmpegPath || 'ffmpeg');
else if (command === 'init-config') {
  const targetPath = process.argv[3] ? resolve(process.argv[3]) : userConfigPath();
  const writtenPath = initConfig(targetPath, resolve(root, 'recorder.config.example.json'));
  console.log(`Config ready: ${writtenPath}`);
  console.log('Edit browser.device, mic.device, and DEEPGRAM_API_KEY before live mode.');
}
else if (command === 'help' || command === '--help' || command === '-h') console.log(help(configPath, config));
else {
  console.error(`Unknown command: ${command}\n`);
  console.log(help(configPath, config));
  process.exit(1);
}
