#!/usr/bin/env bun

import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const srcDir = path.resolve(rootDir, 'src');
const distDir = path.resolve(rootDir, 'dist');
const publicDir = path.resolve(rootDir, 'public');

async function build() {
  console.log('Building plugin...');

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [path.join(srcDir, 'main.ts')],
    outdir: distDir,
    target: 'browser',
    format: 'cjs',
    minify: true,
    naming: '[name].js',
  });
  if (!result.success) {
    throw new AggregateError(result.logs, 'Plugin bundle failed');
  }

  console.log('Copying public files...');
  for (const file of await readdir(publicDir)) {
    await cp(path.resolve(publicDir, file), path.resolve(distDir, file), {
      recursive: true,
    });
  }

  console.log('Build complete!');
}

await build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
