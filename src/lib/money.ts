export const currencyDigits = (currency: string) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 0;
export function money(amount: string | number | bigint, currency = 'CLP', compact = false) {
  const digits = currencyDigits(currency);
  if (compact)
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(Number(amount) / 10 ** digits);
  const minor = typeof amount === 'number' ? BigInt(Math.round(amount)) : BigInt(amount);
  const divisor = 10n ** BigInt(digits),
    whole = minor / divisor;
  const remainder = (minor < 0n ? -minor : minor) % divisor;
  const parts = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).formatToParts(minor < 0n && whole === 0n ? -0 : whole);
  return parts
    .map((part) =>
      part.type === 'fraction' ? remainder.toString().padStart(digits, '0') : part.value,
    )
    .join('');
}
export function summarize(
  rows: { amount: string; type: 'CREDIT' | 'DEBIT' }[],
  balances: string[],
) {
  const credit = rows.filter((r) => r.type === 'CREDIT').reduce((s, r) => s + BigInt(r.amount), 0n);
  const debit = rows
    .filter((r) => r.type === 'DEBIT')
    .reduce((s, r) => s + (BigInt(r.amount) < 0n ? -BigInt(r.amount) : BigInt(r.amount)), 0n);
  return {
    balance: balances.reduce((s, r) => s + BigInt(r), 0n).toString(),
    credit: credit.toString(),
    debit: debit.toString(),
    net: (credit - debit).toString(),
  };
}
export const dateLabel = (date: string | Date | null) =>
  date
    ? new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(date))
    : 'Sin sincronizar';
