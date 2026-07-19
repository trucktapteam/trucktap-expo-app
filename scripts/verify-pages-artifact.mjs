import fs from 'node:fs';
import path from 'node:path';

const outputDirectory = path.resolve(process.argv[2] ?? 'dist');
const requiredFiles = ['index.html', '404.html', 'CNAME', '.nojekyll'];

for (const name of requiredFiles) {
  if (!fs.existsSync(path.join(outputDirectory, name))) {
    throw new Error(`Pages artifact is missing ${name}`);
  }
}

const indexHtml = fs.readFileSync(path.join(outputDirectory, 'index.html'));
const fallbackHtml = fs.readFileSync(path.join(outputDirectory, '404.html'));
if (!indexHtml.equals(fallbackHtml)) {
  throw new Error('Pages 404.html is not the freshly built index.html');
}

const requiredEnvironment = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_RORK_API_BASE_URL',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
];
for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Pages verification requires ${name}`);
  }
}

const javascriptDirectory = path.join(outputDirectory, '_expo', 'static', 'js');
const javascriptFiles = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(entryPath);
    else if (entry.name.endsWith('.js')) javascriptFiles.push(entryPath);
  }
};
visit(javascriptDirectory);

const bundle = javascriptFiles
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
for (const name of requiredEnvironment) {
  if (!bundle.includes(process.env[name])) {
    throw new Error(`Pages bundle does not contain configured ${name}`);
  }
}

console.log('Pages artifact uses one fresh configured application shell.');
