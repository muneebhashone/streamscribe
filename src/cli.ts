#!/usr/bin/env bun
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { help, initConfig, listDevices, liveTranscribeAndSpeak, loadConfig, record, resolveConfigPath, resolveZeroConfig, userConfigPath } from './lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const argv = process.argv.slice(2);
const wantsPick = argv.includes('--pick');
const positional = argv.filter(a => !a.startsWith('-'));
const command = positional[0] || 'live';
const configPath = resolveConfigPath(root);
const config = loadConfig(configPath);

if (command === 'live' || command === 'start') {
  const resolved = await resolveZeroConfig({ config, configPath, root, force: wantsPick });
  liveTranscribeAndSpeak(resolved.config);
}
else if (command === 'record') {
  const resolved = await resolveZeroConfig({ config, configPath, root, force: wantsPick });
  record(resolved.config, { root, configPath: resolved.configPath });
}
else if (command === 'pick') {
  await resolveZeroConfig({ config, configPath, root, force: true });
}
else if (command === 'devices') await listDevices(config.ffmpegPath || 'ffmpeg');
else if (command === 'init-config') {
  const targetPath = positional[1] ? resolve(positional[1]) : userConfigPath();
  const writtenPath = initConfig(targetPath, resolve(root, 'recorder.config.example.json'));
  console.log(`Config ready: ${writtenPath}`);
  console.log('Run `streamscribe live` to pick your audio sources interactively.');
}
else if (command === 'help' || command === '--help' || command === '-h') console.log(help(configPath, config));
else {
  console.error(`Unknown command: ${command}\n`);
  console.log(help(configPath, config));
  process.exit(1);
}
