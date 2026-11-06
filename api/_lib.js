import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv({ automaticDeserialization: false });
export const CONTADOR = 'gasomax:vendidas';

// Peças 1-100 = R$100, 101-500 = R$150, 501+ = R$250
export const TIERS = [{ ate: 100, preco: 100 }, { ate: 500, preco: 150 }, { ate: Infinity, preco: 250 }];
export const HOLD_DIAS = 3;

export const precoDaPeca = n => TIERS.find(t => n <= t.ate).preco;
export function calcula(antes, qtd) {
  let total = 0;
  for (let i = 1; i <= qtd; i++) total += precoDaPeca(antes + i);
  return total;
}

const BASE = process.env.ASAAS_ENV === 'producao' ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';
export async function asaas(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: process.env.ASAAS_API_KEY, 'User-Agent': 'gasomax-encomendas' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.errors?.[0]?.description || 'Erro no Asaas');
  return j;
}

// Libera a vaga de um pedido que ainda estava pendente (uma única vez)
export async function liberaVaga(id, novoStatus) {
  const key = `pedido:${id}`;
  const p = await redis.hgetall(key);
  if (p && p.status === 'pendente') {
    await redis.hset(key, { status: novoStatus });
    await redis.decrby(CONTADOR, Number(p.qtd) || 1);
  }
}
