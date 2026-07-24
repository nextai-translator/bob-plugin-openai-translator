#!/usr/bin/env bun

import path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const bundlePath = path.resolve(rootDir, 'dist/main.js');
const sourceInfoPath = path.resolve(rootDir, 'public/info.json');
const builtInfoPath = path.resolve(rootDir, 'dist/info.json');

const bundleFile = Bun.file(bundlePath);
if (!(await bundleFile.exists())) {
  throw new Error('dist/main.js is missing. Run bun run build first.');
}

const bundle = await bundleFile.text();
const forbiddenPatterns: Array<[string, RegExp]> = [
  ['external require', /\brequire\s*\(/],
  ['Node namespace', /\bnode:/],
  ['process global', /\bprocess(?:\.|\[)/],
  ['Buffer global', /\bBuffer(?:\.|\()/],
  ['fetch API', /\bfetch\s*\(/],
  ['XMLHttpRequest API', /\bXMLHttpRequest\b/],
  ['AbortController API', /\bAbortController\b/],
];

const violations = forbiddenPatterns
  .filter(([, pattern]) => pattern.test(bundle))
  .map(([name]) => name);
if (violations.length > 0) {
  throw new Error(`Bob runtime violations: ${violations.join(', ')}`);
}
if (!bundle.includes('$http')) {
  throw new Error('Bundle does not contain the Bob $http transport.');
}

const plugin = await import(bundlePath);
for (const exportName of [
  'pluginTimeoutInterval',
  'pluginValidate',
  'supportLanguages',
  'translate',
]) {
  if (typeof plugin[exportName] !== 'function') {
    throw new Error(`Bundle is missing the ${exportName} export.`);
  }
}
const supportedLanguages = plugin.supportLanguages() as string[];
if (new Set(supportedLanguages).size !== supportedLanguages.length) {
  throw new Error('supportLanguages() contains duplicate language codes.');
}

const [sourceInfo, builtInfo] = await Promise.all([
  Bun.file(sourceInfoPath).text(),
  Bun.file(builtInfoPath).text(),
]);
if (sourceInfo !== builtInfo) {
  throw new Error('dist/info.json does not match public/info.json.');
}

console.log(
  `Bob runtime check passed: ${bundleFile.size} byte main.js, expected exports, no forbidden runtime APIs.`,
);
