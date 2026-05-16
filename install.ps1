param(
  [switch]$Force,
  [switch]$Version
)

$ErrorActionPreference = 'Stop'

# Flags can also be set via env vars so `irm <url> | iex` users can opt in:
#   $env:STREAMSCRIBE_FORCE = '1'; irm <url> | iex
#   $env:STREAMSCRIBE_VERSION = '1'; irm <url> | iex
$ForceMode = $Force.IsPresent -or ($env:STREAMSCRIBE_FORCE -eq '1')
$VersionMode = $Version.IsPresent -or ($env:STREAMSCRIBE_VERSION -eq '1')

$Repo = 'https://github.com/muneebhashone/streamscribe.git'
$Pkg = "git+$Repo#main"
$Bin = 'streamscribe'

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-ProcessPath {
  $paths = @(
    [Environment]::GetEnvironmentVariable('Path', 'Machine'),
    [Environment]::GetEnvironmentVariable('Path', 'User')
  ) | Where-Object { $_ }
  $env:Path = $paths -join ';'
}

function Get-InstalledStreamscribeVersion {
  if (-not (Test-Command 'streamscribe')) { return $null }
  try {
    $v = (& streamscribe --version 2>&1 | Out-String).Trim()
    if ($v -and $v -notmatch 'Unknown command') { return $v }
  } catch {}
  return $null
}

function Clear-StreamscribeCache {
  # Bun can reuse cached git package resolutions for global installs. Clear only
  # StreamScribe-looking cache entries before each install so reruns update.
  $bunCache = Join-Path $env:USERPROFILE '.bun\install\cache'
  if (Test-Path $bunCache) {
    Get-ChildItem -Path $bunCache -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like '*streamscribe*' -or $_.Name -like '*muneebhashone*' } |
      ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function Uninstall-StreamscribePackage {
  try { bun pm uninstall -g '@muneebhashone/streamscribe' 2>&1 | Out-Null } catch {}
}

function Remove-Streamscribe {
  Write-Host 'Force mode: removing existing streamscribe installation...'
  Uninstall-StreamscribePackage
  $bunBin = Join-Path $env:USERPROFILE '.bun\bin'
  if (Test-Path $bunBin) {
    foreach ($name in @('streamscribe', 'mic-audio-capture', 'chrome-mic-stt', 'audio-recorder')) {
      foreach ($ext in @('', '.exe', '.cmd', '.ps1')) {
        $bin = Join-Path $bunBin "$name$ext"
        if (Test-Path $bin) { Remove-Item $bin -Force -ErrorAction SilentlyContinue }
      }
    }
  }
  Clear-StreamscribeCache
  Write-Host 'Removed.'
}

function Ensure-Bun {
  if (-not (Test-Command 'bun')) {
    Write-Error "Bun is required but was not found on PATH. Install Bun from https://bun.sh/docs/installation, then rerun this installer."
  }
}

function Install-FFmpegPackage {
  Write-Host 'FFmpeg/FFplay were not both found on PATH. Trying to install FFmpeg...'

  if (Test-Command 'winget') {
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
    Refresh-ProcessPath
    return
  }

  if (Test-Command 'choco') {
    choco install ffmpeg -y
    Refresh-ProcessPath
    return
  }

  Write-Warning 'Could not find winget or Chocolatey to install FFmpeg automatically.'
  Write-Warning 'Install FFmpeg manually, then make sure both ffmpeg and ffplay are on PATH: https://ffmpeg.org/download.html'
}

function Ensure-MediaTools {
  if ((Get-Command ffmpeg -ErrorAction SilentlyContinue) -and (Get-Command ffplay -ErrorAction SilentlyContinue)) {
    Write-Host 'Found ffmpeg and ffplay on PATH.'
    return
  }

  Install-FFmpegPackage

  if ((Get-Command ffmpeg -ErrorAction SilentlyContinue) -and (Get-Command ffplay -ErrorAction SilentlyContinue)) {
    Write-Host 'FFmpeg/FFplay setup complete.'
  } else {
    Write-Warning 'ffmpeg and/or ffplay are still not on PATH. StreamScribe can install, but record/live monitoring will need FFmpeg and FFplay.'
  }
}

function Get-LoopbackDrivers {
  if (-not (Test-Command 'ffmpeg')) { return @() }
  # cmd /c handles the 2>&1 merge at the OS level so PowerShell sees a single
  # text stream. PS-native `2>&1` on a native command wraps each stderr line as
  # an ErrorRecord, which silently breaks -match against device names.
  $output = ''
  try {
    $output = cmd /c 'ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1' | Out-String
  } catch {
    return @()
  }
  $found = @()
  if ($output -match 'virtual-audio-capturer') { $found += 'virtual-audio-capturer' }
  if ($output -match 'CABLE Output') { $found += 'CABLE Output (VB-Audio Virtual Cable)' }
  if ($output -match 'Stereo Mix') { $found += 'Stereo Mix' }
  if ($output -match 'VoiceMeeter Out') { $found += 'VoiceMeeter' }
  return $found
}

function Get-LatestScreenCaptureRecorderUrl {
  $fallback = 'https://github.com/rdp/screen-capture-recorder-to-video-windows-free/releases/download/v0.13.3/Setup.Screen.Capturer.Recorder.v0.13.3.exe'
  try {
    $api = 'https://api.github.com/repos/rdp/screen-capture-recorder-to-video-windows-free/releases/latest'
    $rel = Invoke-RestMethod -Uri $api -UseBasicParsing -Headers @{ 'User-Agent' = 'streamscribe-installer' }
    $asset = $rel.assets | Where-Object { $_.name -like 'Setup*.exe' } | Select-Object -First 1
    if ($asset) { return $asset.browser_download_url }
  } catch {}
  return $fallback
}

function Install-ScreenCaptureRecorder {
  $url = Get-LatestScreenCaptureRecorderUrl
  $installerPath = Join-Path $env:TEMP 'streamscribe-scr-setup.exe'
  Write-Host "Downloading screen-capture-recorder..."
  $oldProgress = $ProgressPreference
  $ProgressPreference = 'SilentlyContinue'
  try {
    Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing
  } catch {
    $ProgressPreference = $oldProgress
    Write-Warning "Download failed: $($_.Exception.Message)"
    Write-Warning "Install manually: $url"
    return
  }
  $ProgressPreference = $oldProgress
  Write-Host "Launching installer. Approve UAC and click through Next/Install/Finish..."
  try {
    $proc = Start-Process -FilePath $installerPath -Verb RunAs -Wait -PassThru
    if ($proc.ExitCode -eq 0) {
      Write-Host "screen-capture-recorder installed."
    } else {
      Write-Warning "Installer exited with code $($proc.ExitCode). You may need to install manually."
    }
  } catch {
    Write-Warning "Installer failed to launch: $($_.Exception.Message)"
  }
}

function Ensure-LoopbackDriver {
  if (-not (Test-Command 'ffmpeg')) {
    Write-Warning "Skipping playback-driver check (ffmpeg not on PATH)."
    return
  }
  $drivers = @(Get-LoopbackDrivers)
  if ($drivers.Count -gt 0) {
    Write-Host "Found playback capture driver(s): $($drivers -join ', ')"
    return
  }
  Write-Host ''
  Write-Host 'No playback capture driver detected.'
  Write-Host 'StreamScribe needs one to capture system audio (any app).'
  Write-Host "Recommended: screen-capture-recorder (adds 'virtual-audio-capturer')."
  $reply = Read-Host 'Install screen-capture-recorder now? [Y/n]'
  if ($reply -match '^[Nn]') {
    Write-Host 'Skipped. Install one manually before using live mode:'
    Write-Host '  https://github.com/rdp/screen-capture-recorder-to-video-windows-free'
    Write-Host '  https://vb-audio.com/Cable/'
    return
  }
  Install-ScreenCaptureRecorder
}

function Save-DeepgramKey($ApiKey) {
  [Environment]::SetEnvironmentVariable('DEEPGRAM_API_KEY', $ApiKey, 'User')
  $env:DEEPGRAM_API_KEY = $ApiKey
  Write-Host 'Saved DEEPGRAM_API_KEY to the current user environment. Open a new terminal for other shells to see it.'
}

function Ensure-DeepgramKey {
  if ($env:DEEPGRAM_API_KEY) {
    Write-Host 'Found DEEPGRAM_API_KEY in the environment.'
    return
  }

  Write-Host 'DEEPGRAM_API_KEY was not found in the environment.'
  $DeepgramApiKeyInput = Read-Host 'Enter your Deepgram API key to save for StreamScribe (leave blank to skip)'
  if ($DeepgramApiKeyInput.Trim()) {
    Save-DeepgramKey $DeepgramApiKeyInput.Trim()
  } else {
    Write-Host 'Skipped Deepgram API key setup. Set DEEPGRAM_API_KEY before using live mode.'
  }
}

# --- main flow ---

if ($VersionMode) {
  $installed = Get-InstalledStreamscribeVersion
  if ($installed) {
    Write-Host "streamscribe installed: $installed"
  } else {
    Write-Host 'streamscribe is not installed.'
  }
  exit 0
}

Ensure-Bun
Ensure-MediaTools
Ensure-LoopbackDriver
Ensure-DeepgramKey

if ($ForceMode) {
  Remove-Streamscribe
}

$existing = Get-InstalledStreamscribeVersion
if ($existing -and -not $ForceMode) {
  Write-Host "streamscribe is already installed (version $existing). Updating from main..."
  Uninstall-StreamscribePackage
}

Clear-StreamscribeCache
Write-Host 'Installing streamscribe globally with Bun...'
bun install -g --force --no-cache $Pkg

Write-Host ''
Write-Host 'Installed. Try:'
Write-Host "  $Bin help"
Write-Host "  $Bin live"
Write-Host "  $Bin --version"
Write-Host ''
Write-Host 'Requirements: ffmpeg/ffplay on PATH and DEEPGRAM_API_KEY for live mode.'
