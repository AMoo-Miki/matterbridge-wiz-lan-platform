import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, process.argv[2] || '.');
const stagingRoot = path.join(root, '.pack');
mkdirSync(stagingRoot, { recursive: true });
mkdirSync(output, { recursive: true });
const staging = mkdtempSync(path.join(stagingRoot, 'production-'));
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

// Matterbridge and matter.js must be resolved from the host. Do not ship build
// dependencies or install hooks that could install another copy on that host.
delete manifest.devDependencies;
delete manifest.scripts;
manifest.private = true;
writeFileSync(path.join(staging, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const file of ['dist', 'README.md', 'CHANGELOG.md', 'LICENSE', 'matterbridge-wiz-lan-platform.schema.json']) {
  cpSync(path.join(root, file), path.join(staging, file), { recursive: true });
}

if (!process.env.npm_execpath) throw new Error('Run this script with npm run pack:plugin.');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', output], {
  cwd: staging,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
