import { describe, it, expect } from 'vitest';
import { summarize, money, currencyDigits } from '../src/lib/money';
import { normalizeMovement, FintocBankingProvider, ProviderError } from '../src/providers/fintoc';
import { deduplicate } from '../src/services/sync';
import { parseFilters, transactionWhere, periodRange } from '../src/services/filters';
import { csvCell } from '../src/services/csv';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { decryptCredential, encryptCredential } from '../src/lib/credential-vault';
import { alertDefaults, detectTransactionAlertTypes } from '../src/services/alerts';
const movement = (amount = 1200) => ({
  id: 'mov_test',
  amount,
  currency: 'CLP',
  description: '  TRÁNSFERENCIA   Cliente  ',
  post_date: '2026-10-01T00:00:00Z',
  transaction_date: null,
  type: 'transfer',
  reference_id: '123',
  status: 'confirmed',
  sender_account: { holder_name: 'Cliente' },
  recipient_account: { holder_name: 'Proveedor' },
});
describe('Normalización e importes', () => {
  it('normaliza acentos y espacios sin perder la descripción original', () => {
    const m = normalizeMovement(movement());
    expect(m.normalizedDescription).toBe('transferencia cliente');
    expect(m.description).toContain('TRÁNSFERENCIA');
    expect(m.transactionDate).toEqual(m.postingDate);
  });
  it('clasifica abonos positivos como CREDIT', () => {
    expect(normalizeMovement(movement()).transactionType).toBe('CREDIT');
    expect(normalizeMovement(movement()).counterparty).toBe('Cliente');
  });
  it('clasifica cargos negativos como DEBIT conservando el signo', () => {
    const m = normalizeMovement(movement(-400));
    expect(m.transactionType).toBe('DEBIT');
    expect(m.amount).toBe('-400');
    expect(m.counterparty).toBe('Proveedor');
  });
  it('rechaza importes inseguros o fraccionarios', () => {
    expect(() => normalizeMovement(movement(Number.MAX_SAFE_INTEGER + 1))).toThrow();
    expect(() => normalizeMovement(movement(1.5))).toThrow();
  });
  it('no conserva números o RUT de la contraparte en metadata', () => {
    const m = normalizeMovement({
      ...movement(),
      sender_account: { holder_name: 'Cliente', number: 'sensitive', holder_id: 'private' },
    });
    expect(JSON.stringify(m)).not.toContain('sensitive');
    expect(JSON.stringify(m)).not.toContain('private');
  });
  it('la última versión de un movimiento duplicado prevalece', () => {
    const a = normalizeMovement(movement(1200)),
      b = normalizeMovement(movement(1300));
    expect(deduplicate([a, b])).toHaveLength(1);
    expect(deduplicate([a, b])[0].amount).toBe('1300');
  });
  it('agrega saldos con precisión entera', () => {
    expect(summarize([], ['9007199254740993', '2']).balance).toBe('9007199254740995');
  });
  it('calcula ingresos, egresos y flujo neto', () => {
    expect(
      summarize(
        [
          { amount: '1000', type: 'CREDIT' },
          { amount: '250', type: 'CREDIT' },
          { amount: '-400', type: 'DEBIT' },
        ],
        ['10', '15'],
      ),
    ).toEqual({ balance: '25', credit: '1250', debit: '400', net: '850' });
  });
  it('interpreta USD en centavos y CLP en pesos', () => {
    expect(currencyDigits('CLP')).toBe(0);
    expect(currencyDigits('USD')).toBe(2);
    expect(money(12345, 'USD')).toContain('123,45');
  });
  it('formatea importes grandes sin perder precisión y centavos negativos', () => {
    expect(money('9007199254740993', 'CLP')).toContain('9.007.199.254.740.993');
    expect(money('-50', 'USD')).toContain('-');
    expect(money('-50', 'USD')).toContain('0,50');
  });
});
describe('Filtros y seguridad', () => {
  it('cifra tokens bancarios con autenticación antes de persistirlos', () => {
    const previous = process.env.CREDENTIAL_ENCRYPTION_KEY;
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    try {
      const token = 'link_example_token_private';
      const encrypted = encryptCredential(token);
      expect(encrypted).not.toContain(token);
      expect(decryptCredential(encrypted)).toBe(token);
      expect(() => decryptCredential(encrypted.slice(0, -1) + 'x')).toThrow();
    } finally {
      if (previous === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
      else process.env.CREDENTIAL_ENCRYPTION_KEY = previous;
    }
  });
  it('valida rangos de fechas y montos', () => {
    expect(() => parseFilters({ from: '2026-10-02', to: '2026-10-01' })).toThrow();
    expect(() => parseFilters({ min: '100', max: '20' })).toThrow();
    expect(() => parseFilters({ from: 'invalid' })).toThrow();
  });
  it('limita consultas al holding y moneda', () => {
    const where = transactionWhere(
      parseFilters({ company: 'company', currency: 'USD' }),
      'holding',
    );
    expect(where.currency).toBe('USD');
    expect(where.bankAccount).toMatchObject({
      company: { holdingId: 'holding' },
      companyId: 'company',
      currency: 'USD',
    });
    expect(where.providerStatus).toBe('confirmed');
  });
  it('el período de 7 días incluye exactamente siete fechas', () => {
    const { start, end } = periodRange(
      parseFilters({ period: '7' }),
      new Date('2026-10-06T15:00:00Z'),
    );
    expect(start.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-06T15:00:00.000Z');
  });
  it('bloquea fórmulas en exportaciones CSV', () => {
    expect(csvCell('=HYPERLINK("test")')).toContain("'=HYPERLINK");
    expect(csvCell('hello;"world"')).toBe('"hello;""world"""');
  });
  it('verifica contraseñas scrypt sin almacenar texto plano', () => {
    const hash = hashPassword('test-password-long');
    expect(hash).not.toContain('test-password');
    expect(verifyPassword('test-password-long', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });
});
describe('Adaptador Fintoc', () => {
  it('enmascara números y usa el endpoint real de links', async () => {
    let requested = '';
    const provider = new FintocBankingProvider('secret', async (input) => {
      requested = String(input);
      return Response.json({
        id: 'link_a',
        status: 'active',
        institution: { id: 'cl_banco_de_chile', name: 'Banco de Chile' },
        accounts: [
          {
            id: 'acc_1',
            number: '1234567890',
            name: 'Corriente',
            type: 'checking_account',
            currency: 'CLP',
            balance: { current: 500, available: 400 },
            refreshed_at: '2026-10-06T12:00:00Z',
          },
        ],
      });
    });
    const result = await provider.getConnection('link_token');
    expect(requested).toBe('https://api.fintoc.com/v1/links/link_token');
    expect(result.accounts[0].numberMasked).toBe('•••• 7890');
    expect(result.accounts[0].availableBalance).toBe('400');
  });
  it('pagina todos los movimientos y solicita estados modificados', async () => {
    const urls: string[] = [];
    const provider = new FintocBankingProvider('secret', async (input) => {
      const url = String(input);
      urls.push(url);
      return Response.json(
        url.includes('page=2')
          ? [{ ...movement(), id: 'last' }]
          : Array.from({ length: 300 }, (_, i) => ({ ...movement(), id: `mov_${i}` })),
      );
    });
    const result = await provider.getTransactions(
      'token',
      'acc_1',
      new Date('2026-01-01'),
      new Date('2026-10-06'),
      new Date('2026-10-01'),
    );
    expect(result).toHaveLength(301);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('confirmed_only=false');
    expect(urls[0]).toContain('updated_since=2026-10-01');
  });
  it('no filtra tokens de mensajes de error del proveedor', async () => {
    const provider = new FintocBankingProvider('secret', async () =>
      Response.json({ error: { message: 'secret link_token' } }, { status: 403 }),
    );
    await expect(provider.getConnection('private_token')).rejects.toThrow('HTTP 403');
  });
  it('rechaza configuraciones sin API key', async () => {
    const provider = new FintocBankingProvider('');
    await expect(provider.getConnections()).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('Alertas financieras', () => {
  const debit = normalizeMovement({ ...movement(-15_000_000), status: 'confirmed' });

  it('detecta pagos de monto elevado', () => {
    expect(detectTransactionAlertTypes(debit, alertDefaults, false)).toContain('LARGE_PAYMENT');
  });

  it('detecta pagos relevantes a una contraparte nueva', () => {
    expect(detectTransactionAlertTypes(debit, alertDefaults, true)).toContain('UNUSUAL_PAYMENT');
  });

  it('detecta pagos rechazados por el proveedor', () => {
    const rejected = normalizeMovement({ ...movement(-1000), status: 'rejected' });
    expect(detectTransactionAlertTypes(rejected, alertDefaults, false)).toContain('PAYMENT_FAILED');
  });
});
