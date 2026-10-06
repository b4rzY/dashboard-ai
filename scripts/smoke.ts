import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
async function main() {
  if (process.env.DEMO_MODE !== 'true')
    throw new Error('Smoke script only supports the isolated demo');
  const base = process.env.APP_URL || 'http://localhost:3000';
  const password = readFileSync('demo-access.local.txt', 'utf8').split('Contraseña: ')[1].trim();
  const unauthorized = await fetch(base + '/api/dashboard');
  assert.equal(unauthorized.status, 401);
  const csrf = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://invalid.example' },
    body: new URLSearchParams({ email: 'demo@gozo.local', password }),
    redirect: 'manual',
  });
  assert.equal(csrf.status, 403);
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { Origin: base },
    body: new URLSearchParams({ email: 'demo@gozo.local', password }),
    redirect: 'manual',
  });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const get = (path: string) => fetch(base + path, { headers: { Cookie: cookie } });
  for (const path of [
    '/',
    '/companies',
    '/companies/company-0',
    '/accounts',
    '/accounts/account-0-0',
    '/transactions',
    '/cashflow',
    '/connections',
    '/settings',
  ]) {
    const response = await get(path);
    assert.equal(response.status, 200, `route ${path}`);
    const html = await response.text();
    assert.ok(!html.includes('No pudimos cargar esta vista'), path);
    assert.ok(!html.includes('FINTOC_SECRET_KEY='), path);
  }
  const response = await get('/api/dashboard');
  const data = await response.json();
  assert.equal(data.balance, '586650000');
  assert.equal(data.accountCount, 23);
  assert.equal(
    data.series.reduce((s: number, r: { credit: number }) => s + r.credit, 0),
    Number(data.credit),
  );
  assert.equal(
    data.series.reduce((s: number, r: { debit: number }) => s + r.debit, 0),
    Number(data.debit),
  );
  const filtered = await (
    await get('/api/transactions?company=company-0&type=CREDIT&q=cliente')
  ).json();
  assert.ok(
    filtered.rows.every(
      (r: { companyId: string; type: string }) =>
        r.companyId === 'company-0' && r.type === 'CREDIT',
    ),
  );
  assert.ok(filtered.count > 0, 'The search must return actual rows, not vacuously pass');
  const usd = await (await get('/api/dashboard?currency=USD')).json();
  assert.equal(usd.balance, '2543078');
  assert.equal(usd.accountCount, 1);
  const exportResponse = await get('/api/transactions/export?company=company-0');
  assert.equal(exportResponse.status, 200);
  const csv = await exportResponse.text();
  assert.ok(csv.includes('Gozo Chile'));
  assert.ok(!csv.includes('Superlogistics'));
  const sync = await fetch(base + '/api/connections/connection-0-0/sync', {
    method: 'POST',
    headers: { Origin: base, Cookie: cookie },
  });
  assert.equal(sync.status, 409);
  const cron = await get('/api/cron');
  assert.equal(cron.status, 401);
  const webhook = await fetch(base + '/api/webhooks/fintoc', { method: 'POST', body: '{}' });
  assert.equal(webhook.status, 503);
  const prefix = `smoke-${randomUUID()}`;
  const testUsers: string[] = [];
  const foreignHolding = prefix + '-holding';
  try {
    await db.holding.create({ data: { id: foreignHolding, name: 'Disposable smoke holding' } });
    for (const [suffix, role, holdingId] of [
      ['viewer', 'VIEWER', 'gozo'],
      ['finance', 'FINANCE', 'gozo'],
      ['foreign', 'ADMIN', foreignHolding],
    ] as const) {
      const email = `${prefix}-${suffix}@test.local`;
      const user = await db.user.create({
        data: { email, name: prefix, role, holdingId, passwordHash: hashPassword(password) },
      });
      testUsers.push(user.id);
      const access = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { Origin: base },
        body: new URLSearchParams({ email, password }),
        redirect: 'manual',
      });
      const testCookie = access.headers.get('set-cookie')?.split(';')[0];
      assert.ok(testCookie);
      const headers = { Cookie: testCookie, Origin: base };
      const dashboard = await fetch(base + '/api/dashboard', { headers });
      assert.equal(dashboard.status, 200);
      const scoped = await dashboard.json();
      const exportResult = await fetch(base + '/api/transactions/export', { headers });
      if (suffix === 'viewer') assert.equal(exportResult.status, 403);
      else {
        assert.equal(exportResult.status, 200);
        await exportResult.text();
      }
      const manual = await fetch(base + '/api/connections/connection-0-0/sync', {
        method: 'POST',
        headers,
      });
      assert.equal(manual.status, suffix === 'foreign' ? 404 : 403);
      if (suffix === 'foreign') {
        assert.equal(scoped.balance, '0');
        const leaked = await (await fetch(base + '/api/transactions', { headers })).json();
        assert.equal(leaked.count, 0);
      }
      await db.user.update({ where: { id: user.id }, data: { active: false } });
      assert.equal((await fetch(base + '/api/dashboard', { headers })).status, 401);
    }
  } finally {
    await db.auditLog.deleteMany({ where: { userId: { in: testUsers } } });
    await db.user.deleteMany({ where: { id: { in: testUsers }, name: prefix } });
    await db.holding.deleteMany({ where: { id: foreignHolding } });
    await db.$disconnect();
  }
  console.log(
    'Smoke OK: login, 9 views, KPIs, chart totals, filters, USD, CSV, CSRF, roles, holding isolation, revoked users and demo sync isolation.',
  );
}
main();
