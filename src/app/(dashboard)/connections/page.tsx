import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getOptions } from '@/services/analytics';
import { parseFilters, type SearchParams } from '@/services/filters';
import { dateLabel } from '@/lib/money';
import { Filters } from '@/components/filters';
import { PageTitle } from '@/components/dashboard';
import { Status } from '@/components/status';
import { SyncButton } from '@/components/sync-button';
import { Empty } from '@/components/tables';
import { CredentialButton } from '@/components/credential-button';
import { SyncAllButton } from '@/components/sync-all-button';
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(),
    filters = parseFilters(await searchParams);
  const [options, connections, jobs] = await Promise.all([
    getOptions(user.holdingId),
    db.bankConnection.findMany({
      where: {
        company: { holdingId: user.holdingId },
        ...(filters.company ? { companyId: filters.company } : {}),
        ...(filters.bank ? { institutionId: filters.bank } : {}),
      },
      include: {
        company: { select: { displayName: true } },
        institution: { select: { name: true } },
        _count: { select: { accounts: true } },
      },
      orderBy: { company: { displayName: 'asc' } },
    }),
    db.syncJob.groupBy({
      by: ['status'],
      where: { connection: { company: { holdingId: user.holdingId } } },
      _count: true,
    }),
  ]);
  return (
    <>
      <PageTitle
        title="Conexiones bancarias"
        description="Identifica problemas de acceso y controla la actualización de tus cuentas."
        action={user.role === 'ADMIN' ? <SyncAllButton /> : undefined}
      />
      <Filters options={options} filters={filters} />
      <div className="connection-summary">
        <div>
          <strong>{connections.filter((c) => c.status === 'CONNECTED').length}</strong>
          <span>Conectadas</span>
        </div>
        <div>
          <strong>
            {
              connections.filter((c) => c.status === 'NEEDS_ATTENTION' || c.status === 'ERROR')
                .length
            }
          </strong>
          <span>Requieren atención</span>
        </div>
        <div>
          <strong>
            {jobs
              .filter((j) => j.status === 'PENDING' || j.status === 'RUNNING')
              .reduce((s, j) => s + j._count, 0)}
          </strong>
          <span>Sincronizaciones en cola</span>
        </div>
      </div>
      <div className="notice">
        La importación periódica consulta los datos disponibles en Fintoc. La actualización en el
        banco depende de la política de Fintoc y puede tardar aproximadamente 4 horas.
      </div>
      <section className="panel">
        {connections.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Banco</th>
                  <th>Estado</th>
                  <th>Última importación</th>
                  <th>Último intento</th>
                  <th>Observación</th>
                  {user.role === 'ADMIN' && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.company.displayName}</strong>
                      <small>{c._count.accounts} cuentas</small>
                    </td>
                    <td>{c.institution.name}</td>
                    <td>
                      <Status status={c.status} />
                    </td>
                    <td>{dateLabel(c.lastSuccessfulSyncAt)}</td>
                    <td>{dateLabel(c.lastAttemptAt)}</td>
                    <td className={c.errorMessage ? 'stale' : ''}>
                      {c.errorMessage || 'Sin incidencias'}
                    </td>
                    {user.role === 'ADMIN' && (
                      <td>
                        <div className="connection-actions">
                          <SyncButton
                            id={c.id}
                            disabled={c.provider === 'MANUAL' || c.status === 'SYNCING'}
                          />
                          {c.provider === 'FINTOC' && (
                            <CredentialButton
                              id={c.id}
                              configured={Boolean(c.credentialCiphertext || c.credentialKey)}
                            />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay conexiones configuradas" />
        )}
      </section>
      {user.role !== 'ADMIN' && (
        <p className="muted">Solo un administrador puede ejecutar sincronizaciones manuales.</p>
      )}
    </>
  );
}
