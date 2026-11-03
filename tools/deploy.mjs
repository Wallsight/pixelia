// Publishes the production build to the site repo served at https://pixeliaverse.github.io/
// (an organization site, so Pages serves its main branch at the domain root).
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' });
const out = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const remote = 'https://github.com/pixeliaverse/pixeliaverse.github.io.git';
const branch = 'main';
const rev = out(['rev-parse', '--short', 'HEAD']);
const name = out(['config', 'user.name']);
const email = out(['config', 'user.email']);

run('npm', ['run', 'build']);
const dir = mkdtempSync(join(tmpdir(), 'pixelia-deploy-'));
try {
  cpSync('dist', dir, { recursive: true });
  writeFileSync(join(dir, '.nojekyll'), '');
  run('git', ['init', '-q', '-b', branch], dir);
  run('git', ['-c', `user.name=${name}`, '-c', `user.email=${email}`, '-c', 'core.autocrlf=false', 'add', '-A'], dir);
  run('git', ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `Deploy ${rev}`], dir);
  run('git', ['push', '-q', '-f', remote, branch], dir);
  console.log(`deployed ${rev} -> ${remote} (${branch})`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
