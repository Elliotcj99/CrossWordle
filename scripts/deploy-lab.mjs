// Builds the site and deploys it to the lab web server over SSH, from this machine.
//
//   npm run deploy:lab -- --host crosswordle-lab [--path /srv/crosswordle]
//
// --host is an SSH host, ideally an alias in ~/.ssh/config that sets the host name, deploy user
// and key, so none of them live in the repo. CROSSWORDLE_LAB_HOST and CROSSWORDLE_LAB_PATH work
// too. Only committed work is deployed; each release is named after its commit.
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { host: { type: 'string' }, path: { type: 'string' } },
});
const host = values.host ?? process.env.CROSSWORDLE_LAB_HOST;
const sitePath = values.path ?? process.env.CROSSWORDLE_LAB_PATH ?? '/srv/crosswordle';
const KEEP_RELEASES = 5;

if (host === undefined || !/^[\w.@-]+$/.test(host) || !/^\/[\w./-]+$/.test(sitePath)) {
  console.error('Usage: npm run deploy:lab -- --host <ssh host> [--path /srv/crosswordle]');
  process.exit(2);
}

/** Runs a command without a shell, stopping the deploy if it fails. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`${command} failed${result.error ? `: ${result.error.message}` : ''}`);
    process.exit(1);
  }
  return result;
}

const output = (command, args) =>
  run(command, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).stdout.trim();

if (output('git', ['status', '--porcelain']) !== '') {
  console.error('Commit or stash your changes first: only committed work is deployed.');
  process.exit(1);
}
const release = output('git', ['rev-parse', 'HEAD']);

run('npm', ['run', 'build'], { shell: process.platform === 'win32' });

const ssh = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes'];
const releasePath = `${sitePath}/releases/${release}`;

run('ssh', [...ssh, host, `rm -rf '${releasePath}'`]);
run('scp', [...ssh, '-r', 'apps/web/dist', `${host}:${releasePath}`]);
// Switch with one atomic rename so visitors never see a half-copied site, then prune.
run('ssh', [
  ...ssh,
  host,
  `ln -sfn 'releases/${release}' '${sitePath}/current.next' && ` +
    `mv -Tf '${sitePath}/current.next' '${sitePath}/current' && ` +
    `cd '${sitePath}/releases' && ls -1t | tail -n +${KEEP_RELEASES + 1} | xargs -r rm -rf --`,
]);
console.log(`Deployed ${release.slice(0, 7)} to ${host}:${sitePath}`);
