import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const version = packageJson.version;
const parts = version.split('.');

if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2])) {
  throw new Error(`Release version must use YYYY.M.D numeric format: ${version}`);
}

const [year, month, day] = parts.map(Number);
const isNormalDay = day >= 1 && day <= 31;
const isExceptionalDay = day > 100;

if (parts[0].length !== 4 || year < 1 || month < 1 || month > 12 || (!isNormalDay && !isExceptionalDay)) {
  throw new Error(`Release version is outside the calendar versioning rules: ${version}`);
}

if (String(month) !== parts[1] || String(day) !== parts[2]) {
  throw new Error(`Release version must not use leading zeroes: ${version}`);
}

if (packageLock.packages?.['']?.version !== version) {
  throw new Error(`package.json and package-lock.json versions do not match: ${version}`);
}

console.log(version);
