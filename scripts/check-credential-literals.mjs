import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDED_DIRECTORIES = new Set(['.git', '.expo', 'dist', 'node_modules']);
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs',
  '.sql', '.toml', '.ts', '.tsx', '.yaml', '.yml',
]);

const CREDENTIAL_PATTERNS = [
  { name: 'JWT literal', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'hard-coded Bearer token', pattern: /\bBearer\s+[A-Za-z0-9_-]{24,}(?:\.[A-Za-z0-9_-]{10,})*/g },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

export function findCredentialLiterals(source) {
  return CREDENTIAL_PATTERNS.flatMap(({ name, pattern }) => {
    pattern.lastIndex = 0;
    return [...source.matchAll(pattern)].map((match) => ({
      name,
      index: match.index ?? 0,
    }));
  });
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === '.env' || entry.name.startsWith('.env.')) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...await collectFiles(fullPath));
      }
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const findings = [];

  for (const file of await collectFiles(ROOT)) {
    const source = await readFile(file, 'utf8');
    for (const finding of findCredentialLiterals(source)) {
      const line = source.slice(0, finding.index).split(/\r?\n/u).length;
      findings.push(`${path.relative(ROOT, file)}:${line}: ${finding.name}`);
    }
  }

  if (findings.length > 0) {
    console.error('Credential-like literals detected (values intentionally suppressed):');
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('No JWT, Bearer-token, or private-key literals detected.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
