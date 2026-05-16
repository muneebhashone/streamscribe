import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const readText = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Bun package distribution', () => {
  test('package exposes stable CLI bins and publish metadata', () => {
    const pkg = readJson('package.json');

    expect(pkg.name).toBe('@muneebhashone/mic-and-audio-capture');
    expect(pkg.bin['mic-audio-capture']).toBe('./src/cli.ts');
    expect(pkg.bin['chrome-mic-stt']).toBe('./src/cli.ts');
    expect(pkg.repository.url).toContain('github.com:muneebhashone/mic-and-audio-capture.git');
    expect(pkg.files).toContain('src');
    expect(pkg.files).toContain('recorder.config.example.json');
    expect(pkg.files).toContain('skills');
  });

  test('curl and irm installers are present and point at the package repository', () => {
    const sh = readText('install.sh');
    const ps1 = readText('install.ps1');

    expect(sh).toContain('bun install -g');
    expect(sh).toContain('github.com/muneebhashone/mic-and-audio-capture');
    expect(ps1).toContain('bun install -g');
    expect(ps1).toContain('github.com/muneebhashone/mic-and-audio-capture');
  });

  test('example config ships separately from local user config', () => {
    expect(existsSync(join(root, 'recorder.config.example.json'))).toBe(true);
    const example = readJson('recorder.config.example.json');
    expect(example.browser.device).toBe('CABLE Output (VB-Audio Virtual Cable)');
    expect(example.deepgram.apiKeyEnv).toBe('DEEPGRAM_API_KEY');
  });
});

describe('agent skill distribution', () => {
  test('ships a valid SKILL.md for AI agents', () => {
    const content = readText('skills/mic-and-audio-capture/SKILL.md');

    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain('name: mic-and-audio-capture');
    expect(content).toContain('description: Use when');
    expect(content).toContain('mic-audio-capture');
    expect(content).toContain('Deepgram');
  });

  test('skills.sh manifest advertises the local skill path', () => {
    const manifest = readJson('skills.json');

    expect(manifest.skills[0].name).toBe('mic-and-audio-capture');
    expect(manifest.skills[0].path).toBe('skills/mic-and-audio-capture');
    expect(manifest.skills[0].agents).toContain('claude');
    expect(manifest.skills[0].agents).toContain('codex');
  });

  test('README documents the skills.sh install command', () => {
    const readme = readText('README.md');

    expect(readme).toContain('https://www.skills.sh/');
    expect(readme).toContain('npx skills add muneebhashone/mic-and-audio-capture');
  });
});
