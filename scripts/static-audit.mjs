import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const appRoot = join(root, 'app');
const files = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.expo', 'dist'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}

function toRoutePath(file) {
  const relativePath = relative(appRoot, file).split(sep).join('/');
  const withoutExtension = relativePath.replace(/\.(?:tsx?|jsx?)$/, '');
  let segments = withoutExtension.split('/').filter(Boolean);

  // Expo Router route groups organize files without adding a URL segment.
  segments = segments.filter((segment) => !/^\(.+\)$/.test(segment));

  // _layout and other Expo Router special files do not define navigable routes.
  segments = segments.filter((segment) => segment !== '_layout' && !segment.startsWith('+'));

  // Expo Router maps any index route to its parent path. app/index.tsx is '/'.
  if (segments.at(-1) === 'index') segments.pop();

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function normalizeReference(value) {
  const path = value.split(/[?#]/, 1)[0];
  if (!path.startsWith('/')) return null;
  const normalized = path.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

function routeMatchesReference(route, reference) {
  if (route === reference) return true;

  const routeSegments = route.split('/').filter(Boolean);
  const referenceSegments = reference.split('/').filter(Boolean);
  if (routeSegments.length !== referenceSegments.length) return false;

  return routeSegments.every((segment, index) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return true;
    if (/^\[\.\.\..+\]$/.test(segment)) return true;
    if (/^\[.+\]$/.test(segment)) return true;
    return segment === referenceSegments[index];
  });
}

function collectNavigationReferences(content) {
  const references = [];
  const patterns = [
    /router\.(?:push|replace|navigate)\(\s*['"]([^'"]+)['"]/g,
    /router\.(?:push|replace|navigate)\(\s*\{\s*pathname\s*:\s*['"]([^'"]+)['"]/g,
    /<Link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/g,
    /<Link\b[^>]*\bhref\s*=\s*\{\s*['"]([^'"]+)['"]\s*\}/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) references.push(match[1]);
  }

  return references;
}

await walk(root);

const source = files.filter((file) => /\.(?:ts|tsx|js|jsx|mjs|json|sql|yml|yaml)$/.test(file));
const text = await Promise.all(source.map(async (file) => [file, await readFile(file, 'utf8')]));
const failures = [];

for (const [file, content] of text) {
  if (
    /sk_(?:live|test)_[A-Za-z0-9]+/.test(content) ||
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(content) ||
    /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"\n]+/.test(content)
  ) {
    failures.push(`${relative(root, file)} contains a credential-like secret`);
  }

  if (/@ts-(?:ignore|expect-error)/.test(content)) {
    failures.push(`${relative(root, file)} contains a TypeScript suppression directive`);
  }
}

const appFiles = files.filter(
  (file) => file.startsWith(`${appRoot}${sep}`) && /\.(?:tsx?|jsx?)$/.test(file),
);
const routes = new Set(
  appFiles
    .map(toRoutePath)
    .filter((route) => route !== null),
);

for (const [file, content] of text.filter(([file]) => file.startsWith(`${appRoot}${sep}`))) {
  for (const rawReference of collectNavigationReferences(content)) {
    const reference = normalizeReference(rawReference);
    if (!reference) continue;

    const exists = [...routes].some((route) => routeMatchesReference(route, reference));
    if (!exists) {
      failures.push(`${relative(root, file)} references missing route ${reference}`);
    }
  }
}

if (!files.some((file) => file.endsWith('.env.example'))) {
  failures.push('.env.example is missing');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Static audit passed: ${source.length} source/config files inspected and ${routes.size} Expo Router routes validated.`);
