import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
const path = '.env';
let content = existsSync(path) ? readFileSync(path, 'utf8') : '';
if (content.includes('DATABASE_URL=') && !content.includes('127.0.0.1:55432'))
  throw new Error('La base configurada no es local. No se modificará.');
const existing = content.match(/DATABASE_URL=postgresql:\/\/gozo:([^@]+)@127\.0\.0\.1:55432/);
const password = existing?.[1] || randomBytes(24).toString('hex');
if (!existing) {
  content = `DATABASE_URL=postgresql://gozo:${password}@127.0.0.1:55432/gozo?schema=public\nAPP_URL=http://localhost:3000\nDEMO_MODE=true\nCRON_SECRET=${randomBytes(32).toString('hex')}\n`;
  writeFileSync(path, content, { mode: 0o600 });
}
const pg = new EmbeddedPostgres({
  databaseDir: '.local-db',
  user: 'gozo',
  password,
  port: 55432,
  persistent: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: (message) => console.log(String(message).replaceAll(password, '[redacted]')),
  onError: (message) => console.error(String(message).replaceAll(password, '[redacted]')),
});
if (!existsSync('.local-db/PG_VERSION')) await pg.initialise();
if (process.platform === 'win32') {
  // pg_ctl creates a restricted Windows process, even from an elevated terminal.
  const { pg_ctl } = await import('@embedded-postgres/windows-x64');
  const run = (file, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(file, args, { windowsHide: true, stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`pg_ctl terminó con código ${code}. Revisa postgres.local.log.`)),
      );
    });
  if (process.argv.includes('--stop')) {
    await run(pg_ctl, ['-D', '.local-db', '-m', 'fast', 'stop'], { windowsHide: true });
    process.exit(0);
  }
  try {
    await run(pg_ctl, ['-D', '.local-db', 'status'], { windowsHide: true });
  } catch {
    await run(
      pg_ctl,
      [
        '-D',
        '.local-db',
        '-l',
        'postgres.local.log',
        '-o',
        '-p 55432 -h 127.0.0.1',
        '-w',
        'start',
      ],
      { windowsHide: true },
    );
  }
} else await pg.start();
const client = pg.getPgClient('postgres', '127.0.0.1');
await client.connect();
const found = await client.query("SELECT 1 FROM pg_database WHERE datname='gozo'");
if (!found.rowCount) await client.query('CREATE DATABASE gozo');
await client.end();
console.log('PostgreSQL local disponible en 127.0.0.1:55432');
if (process.platform !== 'win32') {
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 60_000);
}
