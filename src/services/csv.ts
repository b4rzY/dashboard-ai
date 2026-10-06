export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export const csvRow = (values: unknown[]) => values.map(csvCell).join(';') + '\r\n';
