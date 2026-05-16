$ErrorActionPreference = 'Stop'

$Repo = 'https://github.com/muneebhashone/streamscribe.git'
$Pkg = "git+$Repo"
$Bin = 'streamscribe'

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Bun {
  if (-not (Test-Command 'bun')) {
    Write-Error "Bun is required but was not found on PATH. Install Bun from https://bun.sh/docs/installation, then rerun this installer."
  }
}

function Refresh-ProcessPath {
  $paths = @(
    [Environment]::GetEnvironmentVariable('Path', 'Machine'),
    [Environment]::GetEnvironmentVariable('Path', 'User')
  ) | Where-Object { $_ }
  $env:Path = $paths -join ';'
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

Ensure-Bun
Ensure-MediaTools
Ensure-DeepgramKey

Write-Host 'Installing streamscribe globally with Bun...'
bun install -g $Pkg

Write-Host ''
Write-Host 'Installed. Try:'
Write-Host "  $Bin help"
Write-Host "  $Bin init-config"
Write-Host "  $Bin devices"
Write-Host "  $Bin live"
Write-Host ''
Write-Host 'Requirements: ffmpeg/ffplay on PATH and DEEPGRAM_API_KEY for live mode.'
