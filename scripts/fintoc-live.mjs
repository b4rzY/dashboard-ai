import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { PrismaClient } from '@prisma/client';

class SetupError extends Error {}

const filename = '.env.fintoc.local';
const action = process.argv[2];
const keys = readFileSync('.env.example', 'utf8')
  .split('\n')
  .map((line) => line.match(/^(FINTOC_LINK_[A-Z_]+)=/)?.[1])
  .filter(Boolean);

function load() {
  if (!existsSync(filename)) throw new SetupError('Ejecuta npm run fintoc:prepare primero.');
  const values = parse(readFileSync(filename));
  if (values.DEMO_MODE !== 'false')
    throw new SetupError('El entorno Fintoc requiere DEMO_MODE=false.');
  const demo = existsSync('.env') ? parse(readFileSync('.env')) : {};
  const url = new URL(values.DATABASE_URL);
  const previous = demo.DATABASE_URL ? new URL(demo.DATABASE_URL) : null;
  if (previous && url.host === previous.host && url.pathname === previous.pathname)
    throw new SetupError('La base Fintoc debe ser distinta de la base demo.');
  return { ...process.env, ...values };
}

function run(args, env) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
    child.on('error', () => reject(new SetupError('No se pudo iniciar el comando.')));
    child.on('exit', (code) =>
      code === 0 ? accept() : reject(new SetupError('El comando no se completó.')),
    );
  });
}

async function main() {
  if (action === 'prepare') {
    if (existsSync(filename)) {
      console.log('La configuración privada ya existe; se conserva sin cambios.');
      return;
    }
    const demo = parse(readFileSync('.env'));
    const url = new URL(demo.DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.port !== '55432')
      throw new SetupError(
        'La preparación automática necesita PostgreSQL local en 127.0.0.1:55432.',
      );
    url.pathname = '/gozo_fintoc';
    const content = [
      '# Configuración privada. Completa FINTOC_SECRET_KEY y los FINTOC_LINK_* disponibles.',
      '# No compartir ni subir a GitHub. La demo conserva su archivo .env y su base.',
      `DATABASE_URL=${url.toString()}`,
      'APP_URL=http://localhost:3002',
      'DEMO_MODE=false',
      'ADMIN_EMAIL=admin@gozo.local',
      `ADMIN_PASSWORD=${randomBytes(24).toString('base64url')}`,
      `CRON_SECRET=${randomBytes(32).toString('hex')}`,
      'FINTOC_SECRET_KEY=',
      'FINTOC_WEBHOOK_SECRET=',
      'FINTOC_HISTORY_SINCE=1970-01-01',
      ...keys.map((key) => `${key}=`),
      '',
    ].join('\n');
    writeFileSync(filename, content, { flag: 'wx', mode: 0o600 });
    console.log(
      `Configuración privada creada: ${resolve(filename)}. Las credenciales no se imprimen.`,
    );
    return;
  }
  const env = load();
  if (action === 'init') {
    const url = new URL(env.DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/gozo_fintoc')
      throw new SetupError('La inicialización automática solo crea la base local gozo_fintoc.');
    const adminUrl = new URL(url);
    adminUrl.pathname = '/postgres';
    const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
    try {
      const found = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = 'gozo_fintoc'`;
      if (!found.length) await admin.$executeRawUnsafe('CREATE DATABASE gozo_fintoc');
    } finally {
      await admin.$disconnect();
    }
    const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    try {
      const tables =
        await db.$queryRaw`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Transaction'`;
      if (tables.length && (await db.transaction.count()))
        throw new SetupError('La base ya contiene movimientos. No se inicializará ni modificará.');
    } finally {
      await db.$disconnect();
    }
    await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], env);
    await run(['--import', 'tsx', 'scripts/bootstrap.ts'], env);
    console.log('Base bancaria local lista, sin datos simulados.');
  } else if (action === 'check' || action === 'sync') {
    await run(
      ['--conditions=react-server', '--import', 'tsx', 'scripts/fintoc-check.ts', action],
      env,
    );
  } else if (action === 'start') {
    if (!existsSync('.next/BUILD_ID')) throw new SetupError('Ejecuta npm run build primero.');
    const origin = new URL(env.APP_URL);
    if (origin.origin !== 'http://localhost:3002')
      throw new SetupError('Este inicio local requiere APP_URL=http://localhost:3002.');
    await run(
      ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3002'],
      env,
    );
  } else {
    throw new SetupError('Acción válida: prepare, init, check, sync o start.');
  }
}

main().catch((error) => {
  // Prisma/HTTP errors can contain URLs or private payloads; do not print raw exceptions.
  console.error(
    error instanceof SetupError
      ? error.message
      : 'No se completó el paso Fintoc. Comprueba la configuración privada, PostgreSQL local y el resultado anterior.',
  );
  process.exitCode = 1;
});
