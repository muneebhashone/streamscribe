$ErrorActionPreference = 'Stop'

$Repo = 'https://github.com/muneebhashone/mic-and-audio-capture.git'
$Pkg = "git+$Repo"
$Bin = 'mic-audio-capture'

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Error "Bun is required but was not found on PATH. Install Bun from https://bun.sh/docs/installation, then rerun this installer."
}

Write-Host 'Installing mic-and-audio-capture globally with Bun...'
bun install -g $Pkg

Write-Host ''
Write-Host 'Installed. Try:'
Write-Host "  $Bin help"
Write-Host "  $Bin init-config"
Write-Host "  $Bin devices"
Write-Host "  $Bin live"
Write-Host ''
Write-Host 'Requirements: FFmpeg/FFplay on PATH and DEEPGRAM_API_KEY for live mode.'
