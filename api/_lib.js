import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv({ automaticDeserialization: false });
export const CONTADOR = 'gasomax:vendidas';

// Peças 1-100 = R$100, 101-500 = R$150, 501+ = R$250 (frete incluso para todo o Brasil)
export const TIERS = [{ ate: 100, preco: 100 }, { ate: 500, preco: 150 }, { ate: Infinity, preco: 250 }];
export const HOLD_DIAS = 3;
export const MAX_POR_CPF = 5; // encomendas ativas (pendentes ou pagas) por CPF

export const precoDaPeca = n => TIERS.find(t => n <= t.ate).preco;
export function calcula(antes, qtd) {
  let total = 0;
  for (let i = 1; i <= qtd; i++) total += precoDaPeca(antes + i);
  return total;
}

// ASAAS_ENV precisa ser exatamente "sandbox" ou "producao". Qualquer outro valor dá erro (nunca cai no teste sem avisar).
export function ambiente() {
  const e = process.env.ASAAS_ENV;
  if (e !== 'sandbox' && e !== 'producao') throw new Error('Configuração de pagamento inválida.');
  return e;
}

export async function asaas(path, body) {
  const base = ambiente() === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: process.env.ASAAS_API_KEY, 'User-Agent': 'gasomax-encomendas' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.errors?.[0]?.description || 'Erro no Asaas');
  return j;
}

// Captcha Cloudflare Turnstile
export async function verificaCaptcha(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error('Captcha não configurado.');
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip || undefined })
  });
  const j = await r.json();
  return j.success === true;
}

// Libera a vaga de um pedido que ainda estava pendente (uma única vez)
export async function liberaVaga(id, novoStatus) {
  const key = `pedido:${id}`;
  const p = await redis.hgetall(key);
  if (p && p.status === 'pendente') {
    await redis.hset(key, { status: novoStatus });
    await redis.decrby(CONTADOR, Number(p.qtd) || 1);
    if (p.cpf) await redis.decr(`cpf:${p.cpf}`);
  }
}
