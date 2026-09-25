import { build } from 'esbuild';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const docs = ['README.md', 'README.pt-BR.md', 'CHANGELOG.md', 'LICENSE'];

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/src/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: true,
  keepNames: true,
});

cpSync('src/i18n', 'dist/src/i18n', { recursive: true });
for (const doc of docs) {
  cpSync(doc, `dist/${doc}`);
}

const manifest = JSON.parse(readFileSync('package.json', 'utf-8'));
delete manifest.private;
delete manifest.scripts;
delete manifest.devDependencies;
manifest.main = './src/index.js';
manifest.dependencies = {};
manifest.files = ['src/index.js', 'src/i18n', ...docs];
writeFileSync('dist/package.json', `${JSON.stringify(manifest, null, 2)}\n`);
