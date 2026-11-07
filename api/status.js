import { redis, CONTADOR, TIERS } from './_lib.js';

export default async function handler(_req, res) {
  const v = Number(await redis.get(CONTADOR)) || 0;
  const t = TIERS.find(t => v + 1 <= t.ate);
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  res.json({ vendidas: v, precoAtual: t.preco, restantesNoLote: t.ate === Infinity ? null : t.ate - v });
}
