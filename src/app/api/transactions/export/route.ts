import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseFilters, transactionWhere } from '@/services/filters';
import { csvRow } from '@/services/csv';
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (user.role === 'VIEWER')
    return Response.json(
      { error: 'Se requiere rol Finanzas o Admin para exportar' },
      { status: 403 },
    );
  let filters;
  try {
    filters = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  } catch {
    return Response.json({ error: 'Filtros inválidos' }, { status: 400 });
  }
  const where = transactionWhere(filters, user.holdingId);
  const cutoff = new Date();
  where.createdAt = { lte: cutoff };
  await db.auditLog.create({ data: { userId: user.id, action: 'transactions.export' } });
  const encoder = new TextEncoder();
  let cursor: string | undefined;
  let header = false;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!header) {
          controller.enqueue(
            encoder.encode(
              '\uFEFF' +
                csvRow([
                  'Fecha',
                  'Empresa',
                  'Banco',
                  'Cuenta',
                  'Descripción',
                  'Categoría',
                  'Moneda',
                  'Ingreso (unidad mínima)',
                  'Egreso (unidad mínima)',
                  'Referencia',
                ]),
            ),
          );
          header = true;
        }
        const rows = await db.transaction.findMany({
          where,
          take: 500,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          include: { bankAccount: { include: { company: true, institution: true } } },
        });
        if (canceled) return;
        for (const row of rows)
          controller.enqueue(
            encoder.encode(
              csvRow([
                row.postingDate.toISOString(),
                row.bankAccount.company.displayName,
                row.bankAccount.institution.name,
                row.bankAccount.accountNumberMasked,
                row.description,
                row.category,
                row.currency,
                row.transactionType === 'CREDIT' ? row.amount.toFixed(0) : '',
                row.transactionType === 'DEBIT' ? row.amount.abs().toFixed(0) : '',
                row.reference,
              ]),
            ),
          );
        if (rows.length < 500) controller.close();
        else cursor = rows.at(-1)!.id;
      } catch (error) {
        if (!canceled) controller.error(error);
      }
    },
    cancel() {
      canceled = true;
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gozo-movimientos-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
