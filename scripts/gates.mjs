#!/usr/bin/env node
/**
 * The gates, run as one command.
 *
 * Staged by how many cores each gate can actually use, which is what decides
 * whether running two of them together is free or ruinous.
 *
 *   Stage 1 - lint, type-check, check-translations, together.
 *     All three are single-threaded: ESLint has no concurrency configured, tsc
 *     is single-threaded and walks the workspaces one at a time, and the
 *     translation check is a short node script. Run in series they leave almost
 *     the whole machine idle and cost the sum of their runtimes; run together
 *     they cost the longest of them and still occupy three cores.
 *
 *   Stage 2 - test, alone.
 *     Vitest runs a forked worker pool sized to the machine, so it wants every
 *     core that is going. Starting it beside stage 1 would contend with the
 *     pool the vitest config is already tuned around, trading its speed for
 *     nothing. It goes after.
 *
 * Run-all, not fail-fast: chained with `&&`, a lint error hides a type error
 * hides a failing test, and each one costs another full cycle to find. Every
 * gate runs whatever the others did, and the command exits non-zero if any
 * failed.
 *
 * Output is suppressed for a gate that passes - a passing suite has nothing to
 * say, and its several hundred lines are pure cost to whoever reads this.
 *
 *   node scripts/gates.mjs                      # staged (default)
 *   node scripts/gates.mjs --serial             # one at a time
 *   node scripts/gates.mjs --only lint,test
 *   node scripts/gates.mjs --full               # don't trim failing output
 */

import { spawn } from 'node:child_process';
import os from 'node:os';

const GATES = [
  { name: 'lint', cmd: 'npm run lint', stage: 1 },
  { name: 'type-check', cmd: 'npm run type-check', stage: 1 },
  { name: 'check-translations', cmd: 'npm run check-translations', stage: 1 },
  { name: 'test', cmd: 'npm run test', stage: 2 },
];

const TAIL_LINES = 150;

const args = process.argv.slice(2);
const full = args.includes('--full');
const serial = args.includes('--serial');
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const selected = only ? GATES.filter((g) => only.includes(g.name)) : GATES;
if (selected.length === 0) {
  console.error(`No gate matched --only. Known gates: ${GATES.map((g) => g.name).join(', ')}`);
  process.exit(2);
}

const trim = (text) => {
  const lines = (text || '').split('\n');
  if (full || lines.length <= TAIL_LINES) return lines.join('\n');
  const cut = lines.length - TAIL_LINES;
  return [`… ${cut} earlier lines trimmed (--full to see them) …`, ...lines.slice(-TAIL_LINES)].join('\n');
};

const run = (gate) =>
  new Promise((resolve) => {
    const started = Date.now();
    let output = '';
    const child = spawn(gate.cmd, { shell: true });
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (status) => {
      resolve({ ...gate, ok: status === 0, seconds: ((Date.now() - started) / 1000).toFixed(0), output });
    });
  });

// Stages run in order; within a stage the gates run together, unless --serial.
const stages = serial
  ? selected.map((g) => [g])
  : [...new Set(selected.map((g) => g.stage))].sort().map((s) => selected.filter((g) => g.stage === s));

const results = [];
const wallStart = Date.now();
for (const group of stages) {
  const done = await Promise.all(group.map(run));
  for (const r of done) {
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(20)} ${r.seconds}s`);
  }
}
const wall = ((Date.now() - wallStart) / 1000).toFixed(0);

const failed = results.filter((r) => !r.ok);
for (const r of failed) {
  console.log(`\n${'='.repeat(70)}\nFAILED: ${r.name}  (${r.cmd})\n${'='.repeat(70)}`);
  console.log(trim(r.output));
}

const cpuSeconds = results.reduce((a, r) => a + Number(r.seconds), 0);
console.log(
  `\n${results.length - failed.length}/${results.length} gates passed in ${wall}s` +
    (serial ? ' (serial)' : ` (staged on ${os.cpus().length} cores; ${cpuSeconds}s if run one at a time)`),
);
if (failed.length > 0) {
  console.log(`Failed: ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
