import { db } from '../src/lib/db';
import { FintocBankingProvider, ProviderError } from '../src/providers/fintoc';
import { syncConnection, safeSyncError } from '../src/services/sync';

function usable(value: string | undefined) {
  return Boolean(value && !/[\s*<>]/.test(value) && !/x{5,}/i.test(value));
}

async function main() {
  if (process.env.DEMO_MODE !== 'false') throw new Error('Usa el entorno bancario separado.');
  if (!usable(process.env.FINTOC_SECRET_KEY)) {
    console.error('Falta FINTOC_SECRET_KEY completa en .env.fintoc.local.');
    process.exitCode = 1;
    return;
  }
  const connections = await db.bankConnection.findMany({
    where: { provider: 'FINTOC' },
    include: { institution: true, company: true },
    orderBy: { id: 'asc' },
  });
  const configured = connections.filter((c) => usable(process.env[c.credentialKey || '']));
  console.log(`Conexiones con token completo: ${configured.length}/${connections.length}.`);
  if (!configured.length) {
    console.error('Falta al menos un FINTOC_LINK_* completo para importar datos.');
    process.exitCode = 1;
    return;
  }
  const provider = new FintocBankingProvider();
  let failures = 0;
  for (const connection of configured) {
    const label = `${connection.company.displayName} / ${connection.institution.name}`;
    try {
      const remote = await provider.getConnection(process.env[connection.credentialKey!]!);
      if (remote.institution.id !== connection.institution.providerInstitutionId)
        throw new ProviderError(0, 'El banco del token no corresponde a esta conexión.');
      console.log(
        `${label}: ${remote.status}; ${remote.accounts.filter((a) => a.active).length} cuentas activas.`,
      );
      if (process.argv[2] === 'sync') {
        const result = await syncConnection(connection.id, provider);
        if (result.skipped)
          throw new ProviderError(0, 'La conexión está ocupada; reintenta cuando termine.');
        console.log(
          `${label}: sincronización persistida; ${result.processed} movimientos procesados.`,
        );
      }
    } catch (error) {
      failures++;
      console.error(`${label}: ${safeSyncError(error)}`);
    }
  }
  if (process.argv[2] === 'sync') {
    const accounts = await db.bankAccount.count({ where: { connection: { provider: 'FINTOC' } } });
    const movements = await db.transaction.count({
      where: { bankAccount: { connection: { provider: 'FINTOC' } } },
    });
    console.log(
      `Base bancaria: ${accounts} cuentas, ${movements} movimientos. Fallos: ${failures}.`,
    );
  }
  if (failures) process.exitCode = 1;
}

main()
  .catch(() => {
    console.error(
      'No se pudo validar Fintoc. Comprueba la base y ejecuta npm run fintoc:init si falta inicializarla.',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
