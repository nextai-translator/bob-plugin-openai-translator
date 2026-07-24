#!/usr/bin/env bun

import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { $, semver } from 'bun';

interface VersionInfo {
  desc: string;
  minBobVersion: string;
  sha256: string;
  timestamp: number;
  url: string;
  version: string;
}

interface Appcast {
  identifier: string;
  versions: VersionInfo[];
}

type PluginInfo = Record<string, unknown> & { version: string };

const rootDir = path.resolve(import.meta.dir, '..');
const distDir = path.resolve(rootDir, 'dist');
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const assertStableVersion = (version: string): void => {
  if (!STABLE_VERSION.test(version)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
};

export const validateReleaseVersion = (
  target: string,
  projectVersion: string,
  releasedVersions: readonly string[],
): void => {
  assertStableVersion(target);
  assertStableVersion(projectVersion);
  for (const version of releasedVersions) assertStableVersion(version);

  if (semver.order(target, projectVersion) < 0) {
    throw new Error(
      `Release version ${target} is older than project version ${projectVersion}`,
    );
  }

  const latestRelease = releasedVersions.reduce<string | undefined>(
    (latest, version) =>
      !latest || semver.order(version, latest) > 0 ? version : latest,
    undefined,
  );
  if (latestRelease && semver.order(target, latestRelease) < 0) {
    throw new Error(
      `Release version ${target} is older than latest Appcast version ${latestRelease}`,
    );
  }
};

export const formatDevelopmentVersion = (
  releaseVersion: string,
  build: number,
): string => {
  assertStableVersion(releaseVersion);
  if (!Number.isSafeInteger(build) || build < 0) {
    throw new Error(`Invalid development build: ${build}`);
  }
  return `${releaseVersion}dev${build}`;
};

async function updateProjectVersion(version: string): Promise<void> {
  const projectFiles = await Promise.all(
    ['package.json', 'public/info.json'].map(async (relativePath) => {
      const filePath = path.resolve(rootDir, relativePath);
      const source = await Bun.file(filePath).text();
      const data = JSON.parse(source) as Record<string, unknown>;
      if (typeof data.version !== 'string') {
        throw new Error(`${relativePath} has no string version field`);
      }
      return { filePath, relativePath, source, version: data.version };
    }),
  );
  const projectVersions = new Set(projectFiles.map((file) => file.version));
  if (projectVersions.size !== 1) {
    throw new Error('package.json and public/info.json versions do not match');
  }

  const appcastFile = Bun.file(path.resolve(rootDir, 'appcast.json'));
  const releasedVersions = (await appcastFile.exists())
    ? ((await appcastFile.json()) as Appcast).versions.map(
        (release) => release.version,
      )
    : [];
  validateReleaseVersion(version, projectFiles[0].version, releasedVersions);

  for (const { filePath, source } of projectFiles) {
    await Bun.write(
      filePath,
      source.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`),
    );
  }
}

async function buildAndCheck() {
  console.log('Building plugin...');
  await $`bun run build`.cwd(rootDir);
  await $`bun run check:runtime`.cwd(rootDir);
}

async function readDistInfo(): Promise<PluginInfo> {
  const info = (await Bun.file(
    path.join(distDir, 'info.json'),
  ).json()) as Record<string, unknown>;
  if (typeof info.version !== 'string') {
    throw new Error('dist/info.json has no string version field');
  }
  return info as PluginInfo;
}

async function createDevelopmentVersion(): Promise<string> {
  const info = await readDistInfo();
  return formatDevelopmentVersion(info.version, Date.now());
}

async function packagePlugin(
  archiveVersion: string,
  metadataVersion?: string,
): Promise<string> {
  const packageName = `openai-translator-${archiveVersion}.bobplugin`;
  const packagePath = path.join(distDir, packageName);
  let sourceDir = distDir;
  let stagingDir: string | undefined;

  try {
    if (metadataVersion) {
      stagingDir = await mkdtemp(
        path.join(os.tmpdir(), 'openai-translator-package-'),
      );
      const info = await readDistInfo();
      info.version = metadataVersion;
      await Promise.all([
        cp(path.join(distDir, 'main.js'), path.join(stagingDir, 'main.js')),
        cp(path.join(distDir, 'icon.png'), path.join(stagingDir, 'icon.png')),
        Bun.write(
          path.join(stagingDir, 'info.json'),
          `${JSON.stringify(info, null, 2)}\n`,
        ),
      ]);
      sourceDir = stagingDir;
    }

    console.log(`Creating package: ${packageName}...`);
    await $`zip -j -X -FS ${packagePath} main.js info.json icon.png`.cwd(
      sourceDir,
    );
    return packagePath;
  } finally {
    if (stagingDir) {
      await rm(stagingDir, { recursive: true, force: true });
    }
  }
}

async function updateAppcast(
  version: string,
  desc: string,
  packagePath: string,
): Promise<void> {
  const packageFile = Bun.file(packagePath);
  if (!(await packageFile.exists())) {
    throw new Error(`Release file does not exist: ${packagePath}`);
  }

  const fileContent = await packageFile.arrayBuffer();
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(fileContent);
  const fileHash = hasher.digest('hex');

  const pluginInfo = (await Bun.file(
    path.resolve(rootDir, 'public/info.json'),
  ).json()) as {
    identifier: string;
    minBobVersion: string;
    version: string;
  };
  const packageInfo = (await Bun.file(
    path.resolve(rootDir, 'package.json'),
  ).json()) as { version: string };
  if (pluginInfo.version !== version || packageInfo.version !== version) {
    throw new Error(
      `Release package version ${version} does not match project metadata`,
    );
  }
  const appcastPath = path.resolve(rootDir, 'appcast.json');
  const appcastFile = Bun.file(appcastPath);
  let appcast: Appcast;

  if (await appcastFile.exists()) {
    const content = await appcastFile.text();
    appcast = JSON.parse(content);
  } else {
    appcast = {
      identifier: pluginInfo.identifier,
      versions: [],
    };
  }
  validateReleaseVersion(
    version,
    pluginInfo.version,
    appcast.versions.map((release) => release.version),
  );
  appcast.identifier = pluginInfo.identifier;

  const existingRelease = appcast.versions.find(
    (release) => release.version === version,
  );
  const versionInfo: VersionInfo = {
    version,
    desc: desc.trim(),
    sha256: fileHash,
    url: `https://github.com/nextai-translator/bob-plugin-openai-translator/releases/download/v${version}/openai-translator-${version}.bobplugin`,
    minBobVersion: pluginInfo.minBobVersion,
    timestamp: existingRelease?.timestamp ?? Date.now(),
  };
  appcast.versions = [
    versionInfo,
    ...appcast.versions.filter((release) => release.version !== version),
  ];

  await Bun.write(appcastPath, `${JSON.stringify(appcast, null, 2)}\n`);

  console.log(`Appcast updated for version ${version}`);
}

if (import.meta.main) {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'release': {
        const version = process.argv[3];

        if (!version) {
          console.error('Usage: bun run release <version>');
          process.exit(1);
        }

        await updateProjectVersion(version);
        await buildAndCheck();
        const packagePath = await packagePlugin(version);
        console.log(`Release package created: ${packagePath}`);
        break;
      }
      case 'appcast': {
        const version = process.argv[3];
        const desc = process.argv[4];

        if (!version || !desc?.trim()) {
          console.error(
            'Usage: bun scripts/package.mts appcast <version> <description>',
          );
          process.exit(1);
        }

        await updateAppcast(
          version,
          desc,
          path.join(distDir, `openai-translator-${version}.bobplugin`),
        );
        break;
      }
      case undefined: {
        await buildAndCheck();
        const packagePath = await packagePlugin(
          'dev',
          await createDevelopmentVersion(),
        );
        console.log(`Development package created: ${packagePath}`);
        await $`open -R ${packagePath}`;
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}
