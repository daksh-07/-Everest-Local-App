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

const html = await readFile(join(dist, 'index.html'), 'utf8');
if (!/<html[\s>]/i.test(html) || !html.includes('<script')) {
  throw new Error('Web export is incomplete: dist/index.html does not contain a usable HTML shell.');
}

const buildInfo = JSON.parse(await readFile(join(dist, 'build-info.json'), 'utf8'));
if (!buildInfo || typeof buildInfo !== 'object') {
  throw new Error('Web export is incomplete: build-info.json is not a JSON object.');
}

console.log('Web export verified: HTML shell and build provenance are present.');
