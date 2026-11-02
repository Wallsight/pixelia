// Publishes the production build to the gh-pages branch (served by GitHub Pages).
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' });
const out = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const remote = out(['remote', 'get-url', 'origin']);
const rev = out(['rev-parse', '--short', 'HEAD']);
const name = out(['config', 'user.name']);
const email = out(['config', 'user.email']);

run('npm', ['run', 'build']);
const dir = mkdtempSync(join(tmpdir(), 'pixelia-deploy-'));
try {
  cpSync('dist', dir, { recursive: true });
  writeFileSync(join(dir, '.nojekyll'), '');
  run('git', ['init', '-q', '-b', 'gh-pages'], dir);
  run('git', ['-c', `user.name=${name}`, '-c', `user.email=${email}`, '-c', 'core.autocrlf=false', 'add', '-A'], dir);
  run('git', ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `Deploy ${rev}`], dir);
  run('git', ['push', '-q', '-f', remote, 'gh-pages'], dir);
  console.log(`deployed ${rev} -> gh-pages`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
