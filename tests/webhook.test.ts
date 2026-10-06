import { it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhook } from '../src/services/webhook-signature';
const body = '{"id":"evt_1"}',
  secret = 'test-wh-secret',
  time = 1780000000;
const sig = createHmac('sha256', secret).update(`${time}.${body}`).digest('hex');
it('acepta firma HMAC válida sobre el cuerpo sin parsear', () =>
  expect(verifyWebhook(body, `t=${time},v1=${sig}`, secret, time)).toBe(true));
it('rechaza modificaciones del cuerpo', () =>
  expect(verifyWebhook(body + ' ', `t=${time},v1=${sig}`, secret, time)).toBe(false));
it('rechaza replay fuera de cinco minutos', () =>
  expect(verifyWebhook(body, `t=${time},v1=${sig}`, secret, time + 301)).toBe(false));
it('acepta rotación con múltiples firmas válidas', () =>
  expect(verifyWebhook(body, `t=${time},v1=${'0'.repeat(64)},v1=${sig}`, secret, time)).toBe(true));
it('rechaza formatos inválidos sin arrojar excepciones', () =>
  expect(verifyWebhook(body, 't=bad,v1=no', secret, time)).toBe(false));
