import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { distributionManifest } from './distribution-manifest.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distributionDir = join(rootDir, 'distribution');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

function sourcePath(path) {
  return join(rootDir, path);
}

function destinationPath(path) {
  return join(distributionDir, path);
}

function assertSourceExists(path) {
  if (!existsSync(sourcePath(path))) {
    throw new Error(`Distribution source does not exist: ${path}`);
  }
}

function copyFile(source, destination) {
  assertSourceExists(source);
  const target = destinationPath(destination);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(sourcePath(source), target);
}

function copyDirectory(source, destination, excludedNames = []) {
  assertSourceExists(source);
  if (!lstatSync(sourcePath(source)).isDirectory()) {
    throw new Error(`Distribution source is not a directory: ${source}`);
  }

  const target = destinationPath(destination);
  mkdirSync(target, { recursive: true });
  cpSync(sourcePath(source), target, {
    recursive: true,
    filter: (entry) => !excludedNames.includes(entry.split(/[\\/]/).pop())
  });
}

function writeVersionManifest() {
  const versionPath = destinationPath('version.json');
  writeFileSync(versionPath, `${JSON.stringify({
    name: 'newHOP authoring distribution',
    version: packageJson.version,
    sourceRepository: 'cnr-isti-vclab/newHOP'
  }, null, 2)}\n`);
}

function validateDistribution() {
  const requiredFiles = [
    'LICENSE',
    'README.md',
    'index.html',
    'dist/newhop.js',
    'dist/newhop.global.js',
    'dist/corto.em.js',
    'docs/authoring/index.html',
    'examples/minimal.html'
  ];

  for (const path of requiredFiles) {
    if (!existsSync(destinationPath(path))) {
      throw new Error(`Generated distribution is missing: ${path}`);
    }
  }

  const version = JSON.parse(readFileSync(destinationPath('version.json'), 'utf8'));
  if (version.version !== packageJson.version) {
    throw new Error(`Distribution version ${version.version} does not match package version ${packageJson.version}`);
  }

  validateLocalHtmlLinks();
}

function validateLocalHtmlLinks() {
  const htmlFiles = [];
  const collectHtmlFiles = (directory) => {
    for (const entry of (readDirectory(directory))) {
      const path = join(directory, entry);
      if (lstatSync(path).isDirectory()) collectHtmlFiles(path);
      else if (path.endsWith('.html')) htmlFiles.push(path);
    }
  };
  collectHtmlFiles(distributionDir);

  for (const file of htmlFiles) {
    const text = readFileSync(file, 'utf8');
    const references = text.matchAll(/(?:href|src)="([^"]+)"/g);
    for (const reference of references) {
      const target = reference[1].split('#')[0].split('?')[0];
      if (!target || /^(https?:|mailto:|data:|javascript:|#)/.test(target)) continue;
      const resolved = resolve(dirname(file), target);
      if (!existsSync(resolved)) {
        throw new Error(`Broken local link in ${relative(rootDir, file)}: ${target}`);
      }
    }
  }
}

function readDirectory(directory) {
  return readdirSync(directory);
}

rmSync(distributionDir, { recursive: true, force: true });
mkdirSync(distributionDir, { recursive: true });

for (const file of distributionManifest.files) {
  copyFile(file.source, file.destination);
}

for (const directory of distributionManifest.directories) {
  copyDirectory(directory.source, directory.destination, directory.exclude);
}

writeVersionManifest();
validateDistribution();

console.log(`Authoring distribution ${packageJson.version} created at ${relative(rootDir, distributionDir)}.`);
