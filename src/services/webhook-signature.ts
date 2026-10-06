import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyWebhook(
  payload: string,
  header: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300)
    return false;
  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex'),
    'hex',
  );
  return parts
    .filter(([k, v]) => k === 'v1' && /^[a-f0-9]{64}$/i.test(v || ''))
    .some(([, v]) => timingSafeEqual(Buffer.from(v, 'hex'), expected));
}
