import { redis } from './_lib.js';

// Lista de pedidos em CSV: GET /api/pedidos  com o cabeçalho  Authorization: Bearer <ADMIN_TOKEN>
export default async function handler(req, res) {
  const t = process.env.ADMIN_TOKEN;
  if (!t || req.headers.authorization !== `Bearer ${t}`) return res.status(401).end();
  const ids = (await redis.smembers('gasomax:pedidos')).sort((a, b) => a - b);
  const rows = await Promise.all(ids.map(id => redis.hgetall(`pedido:${id}`).then(p => ({ id, ...p }))));
  const cols = ['id', 'status', 'criado', 'pago_em', 'qtd', 'total', 'cupom', 'tipo', 'marca', 'modelo', 'ano', 'combustivel', 'nome', 'cpf', 'email', 'telefone', 'endereco'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send([cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));
}
