import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const requiredFiles = [join(dist, 'index.html'), join(dist, 'build-info.json')];

for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    throw new Error(`Web export is incomplete: missing ${file.replace(`${root}/`, '')}`);
  }
}

const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
if (manifest?.name !== 'Everest Local' || manifest?.display !== 'standalone' || manifest?.start_url !== '/') {
  throw new Error('Web export is incomplete: manifest.json is missing the required Everest Local PWA settings.');
}
for (const icon of ['/icon-192.png', '/icon-512.png']) {
  try {
    await access(join(dist, icon.slice(1)));
  } catch {
    throw new Error(`Web export is incomplete: missing PWA icon ${icon}.`);
  }
}

const html = await readFile(join(dist, 'index.html'), 'utf8');
if (!/<html[\s>]/i.test(html) || !html.includes('<script')) {
  throw new Error('Web export is incomplete: dist/index.html does not contain a usable HTML shell.');
}
for (const required of [
  'viewport-fit=cover',
  'apple-mobile-web-app-capable',
  'apple-mobile-web-app-status-bar-style',
  'black-translucent',
  'everest-local-theme',
  '--everest-canvas',
  '/manifest.json',
  'everest-search-input',
]) {
  if (!html.includes(required)) {
    throw new Error(`Web export is incomplete: dist/index.html is missing ${required}.`);
  }
}
if (/shrink-to-fit=no/.test(html)) {
  throw new Error('Web export is incomplete: default Expo viewport replaced the Everest Local mobile viewport.');
}

const buildInfo = JSON.parse(await readFile(join(dist, 'build-info.json'), 'utf8'));
if (!buildInfo || typeof buildInfo !== 'object') {
  throw new Error('Web export is incomplete: build-info.json is not a JSON object.');
}
if (typeof buildInfo.commit !== 'string' || !buildInfo.commit) {
  throw new Error('Web export is incomplete: build-info.json is missing a commit identifier.');
}
if (typeof buildInfo.environment !== 'string' || !buildInfo.environment) {
  throw new Error('Web export is incomplete: build-info.json is missing a build environment.');
}

const expectedCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
if (expectedCommit && buildInfo.commit !== expectedCommit) {
  throw new Error(
    `Web export provenance mismatch: expected ${expectedCommit} but artifact reports ${buildInfo.commit}.`,
  );
}

const expectedEnvironment = process.env.VERCEL_ENV;
if (expectedEnvironment && buildInfo.environment !== expectedEnvironment) {
  throw new Error(
    `Web export environment mismatch: expected ${expectedEnvironment} but artifact reports ${buildInfo.environment}.`,
  );
}

console.log(
  `Web export verified: HTML shell and build provenance are present for ${buildInfo.environment} build ${buildInfo.commit}.`,
);
