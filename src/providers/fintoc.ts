import 'server-only';
import { z } from 'zod';
import type {
  BankingProvider,
  ProviderAccount,
  ProviderConnection,
  ProviderTransaction,
} from './banking';
const integer = z.number().int().refine(Number.isSafeInteger, 'Importe fuera del rango seguro');
const institutionSchema = z.object({ id: z.string(), name: z.string() });
const accountSchema = z.object({
  id: z.string(),
  number: z.string().nullable(),
  type: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  name: z.string(),
  balance: z.object({ current: integer, available: integer }),
  removed_from_link: z.boolean().optional(),
  refreshed_at: z.iso.datetime({ offset: true }).nullable().optional(),
});
const linkSchema = z.object({
  id: z.string(),
  institution: institutionSchema,
  status: z.string(),
  refresh_status: z.string().optional(),
  accounts: z.array(accountSchema),
});
export const movementSchema = z.object({
  id: z.string(),
  amount: integer,
  currency: z.string().regex(/^[A-Z]{3}$/),
  description: z.string(),
  post_date: z.iso.datetime({ offset: true }),
  transaction_date: z.iso.datetime({ offset: true }).nullable().optional(),
  reference_id: z.string().nullable().optional(),
  type: z.string(),
  pending: z.boolean().optional(),
  status: z.string().optional(),
  sender_account: z.object({ holder_name: z.string().nullable() }).nullable().optional(),
  recipient_account: z.object({ holder_name: z.string().nullable() }).nullable().optional(),
});
export function normalizeMovement(input: unknown): ProviderTransaction {
  const m = movementSchema.parse(input);
  return {
    id: m.id,
    amount: String(m.amount),
    currency: m.currency,
    description: m.description,
    normalizedDescription: m.description
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim(),
    postingDate: new Date(m.post_date),
    transactionDate: new Date(m.transaction_date || m.post_date),
    transactionType: m.amount < 0 ? 'DEBIT' : 'CREDIT',
    counterparty: (m.amount < 0 ? m.recipient_account : m.sender_account)?.holder_name ?? null,
    reference: m.reference_id ?? null,
    providerStatus: m.status ?? (m.pending ? 'processing' : 'confirmed'),
    rawMetadata: { type: m.type, pending: m.pending ?? false },
  };
}
export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const base = 'https://api.fintoc.com';
export class FintocBankingProvider implements BankingProvider {
  constructor(
    private readonly apiKey = process.env.FINTOC_SECRET_KEY,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private async request(path: string, params: Record<string, string> = {}) {
    if (!this.apiKey) throw new ProviderError(0, 'Falta FINTOC_SECRET_KEY en el servidor');
    const url = new URL(path, base);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: { Authorization: this.apiKey, Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        if (attempt < 2) continue;
        throw new ProviderError(0, 'Fintoc no respondió dentro del plazo');
      }
      if (response.ok) return response.json() as Promise<unknown>;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const delay = Math.min(Number(response.headers.get('retry-after') || 1) * 1000, 3000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // Provider error bodies may contain credentials. Never persist or log them.
      throw new ProviderError(response.status, `Fintoc respondió HTTP ${response.status}`);
    }
    throw new ProviderError(0, 'Fintoc temporalmente no disponible');
  }
  async getConnections() {
    const result: { id: string; institution: { id: string; name: string; code: string } }[] = [];
    for (let page = 1; page <= 1000; page++) {
      const links = z
        .array(z.object({ id: z.string(), institution: institutionSchema }))
        .parse(await this.request('/v1/links', { page: String(page), per_page: '300' }));
      result.push(
        ...links.map((l) => ({
          id: l.id,
          institution: { ...l.institution, code: l.institution.id },
        })),
      );
      if (links.length < 300) return result;
    }
    throw new ProviderError(0, 'Límite de paginación excedido');
  }
  async getConnection(credential: string): Promise<ProviderConnection> {
    const link = linkSchema.parse(
      await this.request(`/v1/links/${encodeURIComponent(credential)}`),
    );
    return {
      id: link.id,
      institution: { ...link.institution, code: link.institution.id },
      status:
        link.status !== 'active' || link.refresh_status === 'interrupted'
          ? 'NEEDS_ATTENTION'
          : link.refresh_status?.includes('refreshing')
            ? 'SYNCING'
            : 'CONNECTED',
      accounts: link.accounts.map((a): ProviderAccount => ({
        id: a.id,
        numberMasked: `•••• ${a.number?.slice(-4) || '—'}`,
        type: a.type,
        currency: a.currency,
        name: a.name,
        currentBalance: String(a.balance.current),
        availableBalance: String(a.balance.available),
        active: !a.removed_from_link,
        refreshedAt: a.refreshed_at ? new Date(a.refreshed_at) : null,
      })),
    };
  }
  async getAccounts(credential: string) {
    return (await this.getConnection(credential)).accounts;
  }
  async getBalances(credential: string) {
    return (await this.getAccounts(credential)).map(({ id, currentBalance, availableBalance }) => ({
      id,
      currentBalance,
      availableBalance,
    }));
  }
  async getTransactions(
    credential: string,
    accountId: string,
    since: Date,
    until: Date,
    updatedSince?: Date,
  ) {
    const result: ProviderTransaction[] = [];
    for (let page = 1; page <= 1000; page++) {
      const params: Record<string, string> = {
        link_token: credential,
        since: since.toISOString().slice(0, 10),
        until: until.toISOString().slice(0, 10),
        per_page: '300',
        page: String(page),
        confirmed_only: 'false',
      };
      if (updatedSince) params.updated_since = updatedSince.toISOString().slice(0, 10);
      const rows = z
        .array(movementSchema)
        .parse(
          await this.request(`/v1/accounts/${encodeURIComponent(accountId)}/movements`, params),
        );
      result.push(...rows.map(normalizeMovement));
      if (rows.length < 300) return result;
    }
    throw new ProviderError(0, 'Límite de paginación excedido');
  }
}
