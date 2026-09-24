import { build } from 'esbuild';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const pieceDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pieceDir, '../../../..');

const REPO_LICENSE = readFileSync(join(repoRoot, 'LICENSE'), 'utf-8');
const MIT_PERMISSION = REPO_LICENSE.slice(
  REPO_LICENSE.indexOf('Permission is hereby granted')
).trim();

const ACTIVEPIECES_NOTICE = `${REPO_LICENSE.split(
  '\n'
)[0].trim()}\n\n${MIT_PERMISSION}`;

const PIECE_LICENSE = `Copyright (c) 2026 Assinafy

${MIT_PERMISSION}`;

function packageRoot(inputPath) {
  const parts = inputPath.split(sep);
  const index = parts.lastIndexOf('node_modules');
  if (index === -1) {
    return null;
  }
  const length = parts[index + 1].startsWith('@') ? 3 : 2;
  return parts.slice(0, index + length).join(sep);
}

function workspaceRoot(inputPath) {
  let dir = dirname(inputPath);
  while (dir.startsWith(repoRoot) && dir !== repoRoot) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return null;
}

function licenseText(dir) {
  const file = readdirSync(dir).find((name) =>
    /^(licen[cs]e|copying)(\..+)?$/i.test(name)
  );
  if (!file) {
    throw new Error(`No license file in ${dir}`);
  }
  return readFileSync(join(dir, file), 'utf-8').trim();
}

const { metafile } = await build({
  entryPoints: [join(pieceDir, 'src', 'index.ts')],
  absWorkingDir: repoRoot,
  bundle: true,
  platform: 'node',
  write: false,
  metafile: true,
  logLevel: 'error',
});

const inputs = Object.keys(metafile.inputs).map((input) =>
  resolve(repoRoot, input)
);
const npmPackages = new Map();
const activepiecesPackages = new Set();
for (const input of inputs) {
  const npmRoot = packageRoot(input);
  if (npmRoot) {
    const manifest = JSON.parse(
      readFileSync(join(npmRoot, 'package.json'), 'utf-8')
    );
    npmPackages.set(`${manifest.name}@${manifest.version}`, {
      manifest,
      dir: npmRoot,
    });
    continue;
  }
  const workspace = workspaceRoot(input);
  const name =
    workspace &&
    JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf-8')).name;
  if (name && name.startsWith('@activepieces/')) {
    activepiecesPackages.add(name);
  }
}

const sections = [
  `## ${[...activepiecesPackages]
    .sort()
    .join(', ')} (MIT)\n\n${ACTIVEPIECES_NOTICE}`,
  ...[...npmPackages.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, { manifest, dir }]) =>
        `## ${id} (${manifest.license ?? 'license below'})\n\n${licenseText(
          dir
        )}`
    ),
];

writeFileSync(
  join(pieceDir, 'LICENSE'),
  `${PIECE_LICENSE}\n\n---\n\nThe published package bundles the following third-party software, each under its own license:\n\n${sections.join(
    '\n\n'
  )}\n`
);

console.info(
  `LICENSE lists ${activepiecesPackages.size} Activepieces libraries and ${npmPackages.size} npm packages.`
);
