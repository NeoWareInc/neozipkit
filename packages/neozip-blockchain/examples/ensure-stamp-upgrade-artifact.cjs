/**
 * Ensures examples/output/stamp-upgrade.nzip exists before verify-upgrade runs.
 * - Creates examples/output if needed
 * - Runs pnpm example:timestamp when stamp.nzip is missing
 * - Runs pnpm example:upgrade -- --wait when stamp-upgrade.nzip is still missing
 *
 * Invoked from package.json only; keep logic minimal (no dotenv here — child pnpm scripts load .env).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pkgRoot = path.resolve(__dirname, '..');
const outDir = path.join(pkgRoot, 'examples', 'output');
const stampPath = path.join(outDir, 'stamp.nzip');
const upgradePath = path.join(outDir, 'stamp-upgrade.nzip');

function runPnpm(script, forwardedArgs = []) {
  const args = forwardedArgs.length
    ? ['run', script, '--', ...forwardedArgs]
    : ['run', script];
  const r = spawnSync('pnpm', args, {
    cwd: pkgRoot,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

fs.mkdirSync(outDir, { recursive: true });

if (fs.existsSync(upgradePath)) {
  process.exit(0);
}

if (!fs.existsSync(stampPath)) {
  console.log('examples/output/stamp.nzip not found — running pnpm example:timestamp first.\n');
  runPnpm('example:timestamp');
}

if (!fs.existsSync(upgradePath)) {
  console.log(
    '\nexamples/output/stamp-upgrade.nzip not found — running pnpm example:upgrade -- --wait (polls until the batch confirms).\n'
  );
  runPnpm('example:upgrade', ['--wait']);
}

if (!fs.existsSync(upgradePath)) {
  console.error(
    '\nCould not produce examples/output/stamp-upgrade.nzip. Check TOKEN_SERVICE_EMAIL, network, and logs above.\n'
  );
  process.exit(1);
}
