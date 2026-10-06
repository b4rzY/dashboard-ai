import { z } from 'zod';
import { Prisma } from '@prisma/client';
const text = z.string().max(160).optional().default('');
const day = z
  .union([z.literal(''), z.iso.date()])
  .optional()
  .default('');
export const filterSchema = z
  .object({
    holding: text,
    company: text,
    bank: text,
    account: text,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('CLP'),
    period: z.enum(['7', '30', '90', '365']).default('30'),
    q: z.string().max(200).default(''),
    type: z.enum(['', 'CREDIT', 'DEBIT']).default(''),
    category: text,
    min: z
      .string()
      .regex(/^\d{0,18}$/)
      .default(''),
    max: z
      .string()
      .regex(/^\d{0,18}$/)
      .default(''),
    from: day,
    to: day,
    status: z.enum(['', 'CONNECTED', 'SYNCING', 'NEEDS_ATTENTION', 'ERROR']).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, 'El rango de fechas es inválido')
  .refine(
    (f) => !f.min || !f.max || BigInt(f.min) <= BigInt(f.max),
    'El rango de montos es inválido',
  );
export type Filters = z.infer<typeof filterSchema>;
export type SearchParams = Record<string, string | string[] | undefined>;
export const parseFilters = (params: SearchParams) =>
  filterSchema.parse(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
export function periodRange(f: Filters, now = new Date()) {
  const end = f.to ? new Date(`${f.to}T23:59:59.999Z`) : now;
  const start = f.from
    ? new Date(`${f.from}T00:00:00.000Z`)
    : new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
          (Number(f.period) - 1) * 86400_000,
      );
  return { start, end };
}
export function accountWhere(f: Filters, holdingId: string): Prisma.BankAccountWhereInput {
  return {
    company: { holdingId, active: true },
    active: true,
    currency: f.currency,
    ...(f.company ? { companyId: f.company } : {}),
    ...(f.bank ? { institutionId: f.bank } : {}),
    ...(f.account ? { id: f.account } : {}),
    ...(f.status ? { connection: { status: f.status } } : {}),
  };
}
export function transactionWhere(f: Filters, holdingId: string): Prisma.TransactionWhereInput {
  const { start, end } = periodRange(f);
  const and: Prisma.TransactionWhereInput[] = [];
  if (f.min) and.push({ OR: [{ amount: { gte: f.min } }, { amount: { lte: `-${f.min}` } }] });
  if (f.max) and.push({ amount: { gte: `-${f.max}`, lte: f.max } });
  if (f.q) {
    const search: Prisma.TransactionWhereInput[] = [
      { description: { contains: f.q, mode: 'insensitive' } },
      {
        normalizedDescription: {
          contains: f.q
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase(),
          mode: 'insensitive',
        },
      },
      { reference: { contains: f.q, mode: 'insensitive' } },
      { counterparty: { contains: f.q, mode: 'insensitive' } },
    ];
    if (/^\d+$/.test(f.q)) search.push({ amount: { in: [f.q, `-${f.q}`] } });
    and.push({ OR: search });
  }
  return {
    bankAccount: { ...accountWhere(f, holdingId), active: undefined },
    currency: f.currency,
    providerStatus: 'confirmed',
    postingDate: { gte: start, lte: end },
    ...(f.type ? { transactionType: f.type } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}
export function filterQuery(f: Filters, overrides: Partial<Filters> = {}) {
  const params = new URLSearchParams();
  Object.entries({ ...f, ...overrides }).forEach(([k, v]) => {
    if (v !== '' && v !== undefined) params.set(k, String(v));
  });
  return params.toString();
}
