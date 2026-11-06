import { redis, liberaVaga } from './_lib.js';

// Cadastre no Asaas: Integrações > Webhooks > URL https://www.gasomax.com.br/api/webhook-asaas
export default async function handler(req, res) {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (req.method !== 'POST' || !token || req.headers['asaas-access-token'] !== token) return res.status(401).end();
  const { event, payment } = req.body || {};
  const id = payment?.externalReference;
  if (id) {
    if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) {
      const key = `pedido:${id}`;
      const p = await redis.hgetall(key);
      if (p?.status === 'cancelado' || p?.status === 'expirado') await redis.incrby('gasomax:vendidas', Number(p.qtd) || 1); // pagou depois de liberada a vaga
      await redis.hset(key, { status: 'pago', pago_em: new Date().toISOString() });
    } else if (['PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED'].includes(event)) {
      await liberaVaga(id, 'cancelado');
    }
  }
  res.status(200).end();
}
