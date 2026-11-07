import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv({ automaticDeserialization: false });
export const CONTADOR = 'gasomax:vendidas';

// Peças 1-100 = R$100, 101-500 = R$190, 501+ = R$350 (frete incluso para todo o Brasil)
export const TIERS = [{ ate: 100, preco: 100 }, { ate: 500, preco: 190 }, { ate: Infinity, preco: 350 }];
export const HOLD_DIAS = 3;
export const MAX_POR_CPF = 5; // encomendas ativas (pendentes ou pagas) por CPF
export const MAX_USOS_CUPOM = 5; // usos totais por cupom

// Cupons ficam na variável CUPONS da Vercel, no formato CODIGO=valor,OUTRO=valor (valor fixo do pedido em reais)
// Retorna null se não digitou cupom, undefined se o cupom não existe, ou { codigo, valor }
export function cupom(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  if (!c) return null;
  for (const par of String(process.env.CUPONS || '').split(',')) {
    const [k, v] = par.split('=');
    const valor = Number(v);
    if (k && k.trim().toUpperCase() === c && valor > 0) return { codigo: c, valor };
  }
  return undefined;
}

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

// Captcha hCaptcha
export async function verificaCaptcha(token, ip) {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) throw new Error('Captcha não configurado.');
  if (!token) return false;
  const p = new URLSearchParams({ secret, response: token });
  if (ip) p.set('remoteip', ip);
  if (process.env.HCAPTCHA_SITE_KEY) p.set('sitekey', process.env.HCAPTCHA_SITE_KEY);
  const r = await fetch('https://api.hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p
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
    if (!p.cupom) await redis.decrby(CONTADOR, Number(p.qtd) || 1); // pedido com cupom não ocupou vaga de lote
    if (p.cpf) await redis.decr(`cpf:${p.cpf}`);
  }
}
