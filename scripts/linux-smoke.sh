#!/usr/bin/env bash
# Linux end-to-end smoke test, intended to run from WSL or a real Linux box.
set -eu
export PATH="$HOME/.bun/bin:$PATH"

TARGET=/tmp/sslinux/streamscribe
mkdir -p /tmp/sslinux
rm -rf "$TARGET"
cp -r /mnt/c/Users/haxor/repos/streamscribe "$TARGET"
cd "$TARGET"

rm -rf node_modules
echo '--- bun install ---'
bun install 2>&1 | tail -8

echo ''
echo '--- bun test ---'
bun test 2>&1 | tail -8

echo ''
echo '--- bun run typecheck ---'
bun run typecheck 2>&1 | tail -8

echo ''
echo '--- streamscribe --version ---'
bun src/cli.ts --version

echo ''
echo '--- streamscribe devices ---'
bun src/cli.ts devices 2>&1 | head -40

echo ''
echo '--- DONE ---'
