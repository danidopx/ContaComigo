import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'package.json',
  'vercel.json',
  '.env.example',
  'api/build-version.js',
  'api/public-config.js',
  'api/ia.js',
  'api/modelos.js',
  'api/create-session.js',
  'api/join-session.js',
  'api/create-character.js',
  'api/submit-decision.js',
  'api/session-status.js',
  'api/consolidate-round.js',
  'api/generate-chapter.js',
  'api/current-state.js',
  'api/admin-crud.js',
  'public/index.html',
  'public/config.js',
  'public/api.js',
  'public/auth.js',
  'public/cv-builder.js',
  'public/main.js',
  'public/style.css',
  'public/sw.js',
  'supabase/migrations/20260420000000_contacomigo_rpg_schema.sql'
];

const jsFiles = [
  'api/build-version.js',
  'api/public-config.js',
  'api/ia.js',
  'api/modelos.js',
  'api/create-session.js',
  'api/join-session.js',
  'api/create-character.js',
  'api/submit-decision.js',
  'api/session-status.js',
  'api/consolidate-round.js',
  'api/generate-chapter.js',
  'api/current-state.js',
  'api/admin-crud.js',
  'public/config.js',
  'public/api.js',
  'public/auth.js',
  'public/cv-builder.js',
  'public/editor.js',
  'public/analise-vaga.js',
  'public/pdf.js',
  'public/main.js',
  'public/sw.js',
  'public/ui.js'
];

async function ensureFileExists(file) {
  await access(file, constants.F_OK);
}

async function validateJson(file) {
  JSON.parse(await readFile(file, 'utf8'));
}

async function validateVercelConfig() {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));

  if (config?.git?.deploymentEnabled !== true) {
    throw new Error('vercel.json: git.deploymentEnabled deve permanecer true.');
  }

  if (config?.github?.autoAlias !== false) {
    throw new Error('vercel.json: github.autoAlias deve permanecer false.');
  }
}

async function validateJavaScript(file) {
  const content = await readFile(file, 'utf8');
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"](\s+with\s+\{[\s\S]*?\})?;\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^\s*export\s*\{[\s\S]*?\}\s*from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/\bexport\s+default\s+/g, '')
    .replace(/\bexport\s+(?=async\s+function|function|const|let|var|class)/g, '')
    .replace(/\bexport\s*\{[\s\S]*?\};?/gm, '');

  try {
    new Function(normalized);
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  await Promise.all(requiredFiles.map(ensureFileExists));
  await Promise.all([validateJson('package.json'), validateJson('vercel.json')]);
  await validateVercelConfig();

  for (const file of jsFiles) {
    await validateJavaScript(file);
  }

  console.log('CI validation passed.');
} catch (error) {
  console.error('CI validation failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
