// Bundles a TypeScript dev tool with rolldown (already a Vite dependency) and runs it in Node.
// Usage: node tools/run.mjs <entry.ts> [args...]
import { build } from 'rolldown';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [entry, ...args] = process.argv.slice(2);
if (!entry) {
  console.error('usage: node tools/run.mjs <entry.ts> [args...]');
  process.exit(1);
}
const outFile = join(mkdtempSync(join(tmpdir(), 'pixelia-tool-')), 'tool.mjs');
await build({ input: resolve(entry), platform: 'node', output: { file: outFile, format: 'esm' }, logLevel: 'warn' });
process.argv = [process.argv[0], outFile, ...args];
await import(pathToFileURL(outFile).href);
