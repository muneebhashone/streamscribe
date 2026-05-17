import { createInterface } from 'node:readline';
import type { DiscoveredDevice } from './lib';

export type PickerResult =
  | { ok: true; playback: DiscoveredDevice; mic: DiscoveredDevice }
  | { ok: false; reason: 'cancelled' | 'no-playback' | 'no-mic' | 'no-tty' };

const RECOMMENDED_PLAYBACK = /virtual-audio-capturer|BlackHole|\.monitor$|Monitor of /i;
const PLAYBACK_NOTES: Array<{ pattern: RegExp; note: string }> = [
  { pattern: /virtual-audio-capturer/i, note: 'recommended — captures any app' },
  { pattern: /CABLE Output/i, note: 'requires per-app routing in Windows' },
  { pattern: /Stereo Mix/i, note: 'built-in loopback (if enabled in Sound settings)' },
  { pattern: /VoiceMeeter Out/i, note: 'VoiceMeeter virtual output' },
  { pattern: /BlackHole/i, note: 'macOS virtual audio driver — needs Multi-Output Device to also hear audio' },
  { pattern: /Loopback Audio/i, note: 'Rogue Amoeba Loopback virtual device' },
  { pattern: /Soundflower/i, note: 'legacy macOS loopback (Soundflower)' },
  { pattern: /Multi-Output Device/i, note: 'macOS Multi-Output Device (Audio MIDI Setup)' },
  { pattern: /\.monitor$|Monitor of /i, note: 'PulseAudio monitor — native loopback, no extra driver needed' },
];

function noteFor(name: string): string | null {
  for (const { pattern, note } of PLAYBACK_NOTES) if (pattern.test(name)) return note;
  return null;
}

function printList(title: string, devices: DiscoveredDevice[], highlight?: (d: DiscoveredDevice) => boolean): void {
  console.log(`\n${title}`);
  devices.forEach((d, i) => {
    const tag = noteFor(d.name);
    const star = highlight?.(d) ? ' [recommended]' : '';
    const noteText = tag ? `  [${tag}]` : '';
    console.log(`  ${i + 1}) ${d.name}${star || noteText}`);
  });
  console.log('  c) cancel');
}

function ask(question: string): Promise<string> {
  return new Promise(resolveAsk => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolveAsk(answer.trim());
    });
  });
}

async function pickOne(label: string, devices: DiscoveredDevice[], highlight?: (d: DiscoveredDevice) => boolean): Promise<DiscoveredDevice | 'cancelled'> {
  for (;;) {
    printList(label, devices, highlight);
    const answer = await ask('> ');
    if (answer.toLowerCase() === 'c') return 'cancelled';
    const n = Number.parseInt(answer, 10);
    if (Number.isInteger(n) && n >= 1 && n <= devices.length) {
      const pick = devices[n - 1];
      if (pick) return pick;
    }
    console.log(`Please enter a number between 1 and ${devices.length}, or 'c' to cancel.`);
  }
}

export async function runPicker({ playback, mics }: { playback: DiscoveredDevice[]; mics: DiscoveredDevice[] }): Promise<PickerResult> {
  if (!process.stdin.isTTY) return { ok: false, reason: 'no-tty' };
  if (playback.length === 0) return { ok: false, reason: 'no-playback' };
  if (mics.length === 0) return { ok: false, reason: 'no-mic' };

  console.log('First-time setup: pick your audio sources.');

  const orderedPlayback = [...playback].sort((a, b) => {
    const aRec = RECOMMENDED_PLAYBACK.test(a.name) ? 0 : 1;
    const bRec = RECOMMENDED_PLAYBACK.test(b.name) ? 0 : 1;
    return aRec - bRec || a.name.localeCompare(b.name);
  });

  const playbackPick = await pickOne(
    'Playback source (any app’s audio — Chrome, Zoom, Spotify, etc.):',
    orderedPlayback,
    d => RECOMMENDED_PLAYBACK.test(d.name),
  );
  if (playbackPick === 'cancelled') return { ok: false, reason: 'cancelled' };

  const micPick = await pickOne('Microphone (pick one of your attached mics):', mics);
  if (micPick === 'cancelled') return { ok: false, reason: 'cancelled' };

  return { ok: true, playback: playbackPick, mic: micPick };
}
