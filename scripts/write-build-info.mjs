import { mkdir, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
await mkdir(dist, { recursive: true });

const buildInfo = {
  commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local',
  environment: process.env.VERCEL_ENV || 'local',
};

await writeFile(new URL('build-info.json', dist), `${JSON.stringify(buildInfo)}\n`, 'utf8');
console.log(`Wrote dist/build-info.json for ${buildInfo.environment} build ${buildInfo.commit}`);
