import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const readText = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Bun package distribution', () => {
  test('package exposes StreamScribe CLI bins and publish metadata', () => {
    const pkg = readJson('package.json');

    expect(pkg.name).toBe('@muneebhashone/streamscribe');
    expect(pkg.bin.streamscribe).toBe('./src/cli.ts');
    expect(pkg.bin['streamscribe']).toBe('./src/cli.ts');
    expect(pkg.bin['chrome-mic-stt']).toBe('./src/cli.ts');
    expect(pkg.repository.url).toContain('github.com:muneebhashone/streamscribe.git');
    expect(pkg.files).toContain('src');
    expect(pkg.files).toContain('recorder.config.example.json');
    expect(pkg.files).toContain('skills');
  });

  test('curl and irm installers point at the StreamScribe repository', () => {
    const sh = readText('install.sh');
    const ps1 = readText('install.ps1');

    expect(sh).toContain('bun install -g --force --no-cache "$resolved_pkg"');
    expect(sh).toContain('install_streamscribe_package');
    expect(sh).toContain('resolve_streamscribe_package');
    expect(sh).toContain('github:muneebhashone/streamscribe');
    expect(sh).toContain('MAIN_COMMIT_API');
    expect(sh).toContain('github.com/muneebhashone/streamscribe');
    expect(sh).toContain('PKG="git+${REPO}#main"');
    expect(sh).toContain('BIN="streamscribe"');
    expect(ps1).toContain('bun install -g --force --no-cache $resolvedPkg');
    expect(ps1).toContain('Install-StreamscribePackage');
    expect(ps1).toContain('Resolve-StreamscribePackage');
    expect(ps1).toContain('github:muneebhashone/streamscribe');
    expect(ps1).toContain('$MainCommitApi');
    expect(ps1).toContain('github.com/muneebhashone/streamscribe');
    expect(ps1).toContain('$Pkg = "git+$Repo#main"');
    expect(ps1).toContain("$Bin = 'streamscribe'");
  });

  test('installers run Bun global install outside the local package cwd', () => {
    const sh = readText('install.sh');
    const ps1 = readText('install.ps1');

    expect(sh).toContain('install_cwd="${TMPDIR:-/tmp}"');
    expect(sh).toContain('cd "$install_cwd"');
    expect(ps1).toContain('$installCwd = $env:TEMP');
    expect(ps1).toContain('Push-Location $installCwd');
    expect(ps1).toContain('throw "bun install failed with exit code $LASTEXITCODE"');
  });

  test('installers rerun as updates without relying on stale Bun git cache', () => {
    const sh = readText('install.sh');
    const ps1 = readText('install.ps1');

    expect(sh).toContain('clear_streamscribe_cache');
    expect(sh).toContain("uninstall_streamscribe_package");
    expect(sh).toContain("bun remove -g '@muneebhashone/streamscribe'");
    expect(sh).toContain('Updating from main');
    expect(sh).toContain('-name \'*streamscribe*\'');
    expect(sh).toContain('-name \'*muneebhashone*\'');

    expect(ps1).toContain('Clear-StreamscribeCache');
    expect(ps1).toContain('Uninstall-StreamscribePackage');
    expect(ps1).toContain("bun remove -g '@muneebhashone/streamscribe'");
    expect(ps1).toContain('Updating from main');
    expect(ps1).toContain("*streamscribe*");
    expect(ps1).toContain("*muneebhashone*");
  });

  test('installers install or guide FFmpeg and FFplay setup', () => {
    const sh = readText('install.sh');
    const ps1 = readText('install.ps1');

    expect(sh).toContain('ensure_media_tools');
    expect(sh).toContain('have ffmpeg');
    expect(sh).toContain('have ffplay');
    expect(sh).toContain('brew install ffmpeg');
    expect(sh).toContain('apt-get install -y ffmpeg');
    expect(ps1).toContain('Ensure-MediaTools');
    expect(ps1).toContain('Get-Command ffmpeg');
    expect(ps1).toContain('Get-Command ffplay');
    expect(ps1).toContain('winget install');
  });

  test('installers prompt for and persist a missing Deepgram API key', () => {
    const sh = readText('install.sh');
    const ps1 = readText('install.ps1');

    expect(sh).toContain('DEEPGRAM_API_KEY');
    expect(sh).toContain('read -r DEEPGRAM_API_KEY_INPUT');
    expect(sh).toContain('save_deepgram_key');
    expect(sh).toContain('export DEEPGRAM_API_KEY=');
    expect(ps1).toContain('DEEPGRAM_API_KEY');
    expect(ps1).toContain('Read-Host');
    expect(ps1).toContain('$null -ne $DeepgramApiKeyInput');
    expect(ps1).toContain('SetEnvironmentVariable');
    expect(ps1).toContain('User');
  });

  test('installers support --force and --version flags', () => {
    const sh = readText('install.sh');
    const ps1 = readText('install.ps1');

    expect(sh).toContain('--force');
    expect(sh).toContain('--version');
    expect(sh).toContain('FORCE_MODE');
    expect(sh).toContain('VERSION_MODE');
    expect(sh).toContain('STREAMSCRIBE_FORCE');
    expect(sh).toContain('STREAMSCRIBE_VERSION');
    expect(sh).toContain('remove_streamscribe');
    expect(sh).toContain('get_installed_version');

    expect(ps1).toContain('[switch]$Force');
    expect(ps1).toContain('[switch]$Version');
    expect(ps1).toContain('STREAMSCRIBE_FORCE');
    expect(ps1).toContain('STREAMSCRIBE_VERSION');
    expect(ps1).toContain('Remove-Streamscribe');
    expect(ps1).toContain('Get-InstalledStreamscribeVersion');
  });

  test('Windows installer probes for a playback capture driver and offers screen-capture-recorder', () => {
    const ps1 = readText('install.ps1');

    expect(ps1).toContain('Ensure-LoopbackDriver');
    expect(ps1).toContain('Get-LoopbackDrivers');
    expect(ps1).toContain('Install-ScreenCaptureRecorder');
    expect(ps1).toContain('virtual-audio-capturer');
    expect(ps1).toContain('CABLE Output');
    expect(ps1).toContain('Stereo Mix');
    expect(ps1).toContain('rdp/screen-capture-recorder-to-video-windows-free');
    expect(ps1).toContain('Install screen-capture-recorder now?');
  });

  test('example config ships separately from local user config', () => {
    expect(existsSync(join(root, 'recorder.config.example.json'))).toBe(true);
    const example = readJson('recorder.config.example.json');
    expect(example.browser.device).toBe('');
    expect(example.mic.device).toBe('');
    expect(example.monitor.enabled).toBe('auto');
    expect(example.deepgram.apiKeyEnv).toBe('DEEPGRAM_API_KEY');
  });
});

describe('agent skill distribution', () => {
  test('ships a valid StreamScribe SKILL.md for AI agents', () => {
    const content = readText('skills/streamscribe/SKILL.md');

    expect(content.startsWith('---')).toBe(true);
    expect(content).toContain('name: streamscribe');
    expect(content).toContain('description: Use when');
    expect(content).toContain('streamscribe');
    expect(content).toContain('Deepgram');
  });

  test('skills.sh manifest advertises the StreamScribe skill path', () => {
    const manifest = readJson('skills.json');

    expect(manifest.repository).toBe('https://github.com/muneebhashone/streamscribe');
    expect(manifest.skills[0].name).toBe('streamscribe');
    expect(manifest.skills[0].path).toBe('skills/streamscribe');
    expect(manifest.skills[0].agents).toContain('claude');
    expect(manifest.skills[0].agents).toContain('codex');
  });

  test('README documents StreamScribe commands and skills.sh install command', () => {
    const readme = readText('README.md');

    expect(readme).toContain('# StreamScribe');
    expect(readme).toContain('https://www.skills.sh/');
    expect(readme).toContain('npx skills add muneebhashone/streamscribe');
    expect(readme).toContain('streamscribe live');
    expect(readme).toContain('Rerun the same one-line installer command any time to update');
    expect(readme).toContain('resolve `main` to the current commit');
    expect(readme).toContain('bun install -g --force --no-cache github:muneebhashone/streamscribe#<main-sha>');
  });
});
