import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { parse } from 'dotenv';

const root = resolve('.open-next');
const secrets = new Set();
for (const file of await readdir('.')) {
  if (!file.startsWith('.env') || file.endsWith('.example')) continue;
  const env = parse(await readFile(file));
  for (const [key, value] of Object.entries(env)) {
    if (!value || !/(PASSWORD|SECRET|TOKEN|DATABASE_URL|FINTOC_LINK_)/.test(key)) continue;
    secrets.add(value);
    if (key === 'DATABASE_URL') {
      const password = decodeURIComponent(new URL(value).password);
      if (password.length >= 8) secrets.add(password);
    }
  }
}
// OpenNext copies .env files into this module. Runtime credentials come only
// from Cloudflare bindings; local credentials must never enter a deployment.
await writeFile(
  join(root, 'cloudflare', 'next-env.mjs'),
  'export const production = {};\nexport const development = {};\nexport const test = {};\n',
);

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (!path.startsWith(root + '\\') && !path.startsWith(root + '/'))
      throw new Error('Ruta de compilación inválida.');
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await scan(path);
    else if (entry.name === '.env' || entry.name.startsWith('.env.')) await unlink(path);
    else {
      const content = await readFile(path);
      if ([...secrets].some((secret) => content.includes(Buffer.from(secret))))
        throw new Error(
          `La compilación contiene credenciales locales: ${relative(root, path)}. Despliegue bloqueado.`,
        );
    }
  }
}
await scan(root);
console.log('Compilación de Cloudflare verificada: sin credenciales locales.');
