import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
const names = [
  'Gozo Chile',
  'EHG',
  'Superlogistics',
  'Rental Pro',
  'Eventure',
  'RRHI',
  'DCE Inversiones',
  'Inversiones Costa',
  'Mantagua',
];
const bankNames = ['Banco de Chile', 'BCI', 'BICE', 'Itaú', 'Santander', 'Global66'];
const counts = [4, 3, 3, 3, 2, 3, 2, 2, 2];
const descriptions = [
  'Abono cliente · Factura',
  'Pago proveedor · Servicios',
  'Abono servicio corporativo',
  'Pago remuneraciones',
  'Cobro operación logística',
  'Pago mantención equipos',
  'Abono producción evento',
  'Pago servicios básicos',
  'Recaudación ventas',
  'Pago impuestos',
];
async function main() {
  if (process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production')
    throw new Error('Seed permitido solo con DEMO_MODE=true fuera de producción');
  const existingHolding = await db.holding.findUnique({ where: { id: 'gozo' } });
  if (existingHolding)
    throw new Error('La base ya contiene el holding. Seed cancelado para preservar datos.');
  const accessPath = 'demo-access.local.txt';
  let password = randomBytes(16).toString('base64url');
  if (existsSync(accessPath))
    password = readFileSync(accessPath, 'utf8').split('Contraseña: ')[1]?.trim() || password;
  await db.$transaction(
    async (tx) => {
      await tx.holding.create({ data: { id: 'gozo', name: 'Holding Gozo' } });
      await tx.user.create({
        data: {
          email: 'demo@gozo.local',
          name: 'Finanzas Gozo',
          role: 'ADMIN',
          holdingId: 'gozo',
          passwordHash: hashPassword(password),
        },
      });
      for (let b = 0; b < bankNames.length; b++)
        await tx.bankInstitution.create({
          data: { id: `bank-${b}`, code: `demo-${b}`, name: bankNames[b] },
        });
      for (let c = 0; c < names.length; c++) {
        await tx.company.create({
          data: {
            id: `company-${c}`,
            holdingId: 'gozo',
            displayName: names[c],
            legalName: `${names[c]} SpA`,
          },
        });
        for (let a = 0; a < counts[c]; a++) {
          const bank = (c + a) % 6;
          const id = `account-${c}-${a}`,
            connectionId = `connection-${c}-${a}`;
          const currency = c === 0 && a === 3 ? 'USD' : 'CLP';
          const balance =
            currency === 'USD'
              ? 2543078
              : Math.round(7_000_000 + (9 - c) * 2_950_000 + a * 3_150_000);
          const refreshed = new Date(Date.now() - (c === 7 ? 10 * 3600_000 : 27 * 60_000));
          await tx.bankConnection.create({
            data: {
              id: connectionId,
              companyId: `company-${c}`,
              institutionId: `bank-${bank}`,
              provider: bank === 5 ? 'MANUAL' : 'FINTOC',
              providerConnectionId: `demo-link-${c}-${a}`,
              status: c === 7 ? 'NEEDS_ATTENTION' : 'CONNECTED',
              lastSuccessfulSyncAt: new Date(Date.now() - 27 * 60_000),
              lastAttemptAt: new Date(Date.now() - 27 * 60_000),
              errorMessage: c === 7 ? 'La conexión necesita ser renovada en Fintoc' : null,
            },
          });
          await tx.bankAccount.create({
            data: {
              id,
              companyId: `company-${c}`,
              connectionId,
              institutionId: `bank-${bank}`,
              providerAccountId: `demo-acc-${c}-${a}`,
              accountNumberMasked: `•••• ${String(3201 + c * 71 + a * 19)}`,
              accountType: 'checking_account',
              currency,
              name:
                a === 0 ? 'Cuenta operacional' : a === 1 ? 'Cuenta de pagos' : 'Cuenta de reserva',
              currentBalance: balance,
              availableBalance: balance,
              lastSyncedAt: new Date(Date.now() - 27 * 60_000),
              providerRefreshedAt: refreshed,
            },
          });
          const transactions = [];
          const dailyNet = new Map<number, number>();
          for (let d = 0; d < 120; d++) {
            const credit = (d + c + a) % 3 !== 0;
            const amount =
              Math.round(
                currency === 'USD'
                  ? 17500 + ((d * 912 + c * 850) % 60000)
                  : 180000 + ((d * 135173 + c * 98113 + a * 71139) % 2200000),
              ) * (credit ? 1 : -1);
            const date = new Date();
            date.setUTCDate(date.getUTCDate() - d);
            date.setUTCHours(12 + (d % 4), 0, 0, 0);
            dailyNet.set(d, amount);
            transactions.push({
              id: `transaction-${c}-${a}-${d}`,
              bankAccountId: id,
              providerTransactionId: `demo-mov-${c}-${a}-${d}`,
              postingDate: date,
              transactionDate: date,
              description: `${descriptions[credit ? ((d + c) % 5) * 2 : ((d + c) % 5) * 2 + 1]} ${2000 + d * 3 + c}`,
              normalizedDescription: `${descriptions[credit ? ((d + c) % 5) * 2 : ((d + c) % 5) * 2 + 1].toLowerCase()} ${2000 + d * 3 + c}`,
              amount,
              currency,
              transactionType: credit ? ('CREDIT' as const) : ('DEBIT' as const),
              category: credit
                ? 'Ventas'
                : d % 4 === 0
                  ? 'Remuneraciones'
                  : d % 4 === 1
                    ? 'Proveedores'
                    : d % 4 === 2
                      ? 'Operaciones'
                      : 'Impuestos',
              counterparty: credit ? 'Cliente corporativo' : 'Proveedor de servicios',
              reference: `DEMO-${c}-${a}-${d}`,
              providerStatus: 'confirmed',
            });
          }
          await tx.transaction.createMany({ data: transactions });
          let historical = balance;
          const snapshots = [];
          for (let d = 0; d < 120; d++) {
            if (d > 0) historical -= dailyNet.get(d - 1) || 0;
            const date = new Date();
            date.setUTCDate(date.getUTCDate() - d);
            date.setUTCHours(0, 0, 0, 0);
            snapshots.push({
              bankAccountId: id,
              date,
              availableBalance: historical,
              currentBalance: historical,
              sourceRefreshedAt: date,
            });
          }
          await tx.balanceSnapshot.createMany({ data: snapshots });
        }
      }
    },
    { timeout: 120_000 },
  );
  writeFileSync(
    accessPath,
    `Acceso demo local\nURL: http://localhost:3000\nCorreo: demo@gozo.local\nContraseña: ${password}\n`,
    { mode: 0o600 },
  );
  console.log(
    'Demo creada: 9 empresas, 24 cuentas, 6 instituciones, 2880 movimientos. Acceso en demo-access.local.txt.',
  );
}
main().finally(() => db.$disconnect());
